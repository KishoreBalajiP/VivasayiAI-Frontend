import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  useCallback,
} from 'react';
import {
  getBrowserPosition,
  resolveDistrict,
  type LocationErrorKey,
} from '../services/locationService';

// Browser/device location is a SESSION-level concept, separate from the farm profile
// district. After authentication the app requests permission once, resolves the device
// position to a usable Tamil Nadu district, and reuses it for the rest of the session
// (spec: "Store the resolved location appropriately so it can be reused during the current
// application session"). Weather uses the resolved district via the existing /weather
// contract. On denial/unavailability/outside-TN we never fabricate a location — the app
// surfaces an honest state and may offer the user's own farm-profile district as an
// explicit, user-initiated fallback.

export type LocationStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'unsupported'
  | 'outside-tn';

export interface LocationContextValue {
  status: LocationStatus;
  // Resolved Tamil Nadu district name when status === 'granted'; null otherwise.
  district: string | null;
  // Detected coordinates (kept for the weather card tooltip), null until granted.
  coords: { lat: number; lon: number } | null;
  // Determined failure reason when status is denied/unavailable/unsupported.
  errorKey: LocationErrorKey | null;
  requestLocation: () => Promise<void>;
}

const STORAGE_KEY = 'vivasayi.location';

interface StoredLocation {
  lat: number;
  lon: number;
  district: string;
  isInTamilNadu: boolean;
}

const readStored = (): StoredLocation | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLocation;
    if (
      typeof parsed.lat !== 'number' ||
      typeof parsed.lon !== 'number' ||
      typeof parsed.district !== 'string' ||
      !parsed.district
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeStored = (value: StoredLocation): void => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable — location stays in memory for this page only
  }
};

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components -- standard provider+hook pattern (cf. AuthContext.tsx)
export const useLocation = (): LocationContextValue => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within LocationProvider');
  }
  return context;
};

// Dev StrictMode double-mounts providers; a module-level guard prevents the second mount
// from re-prompting the permission dialog in the same page session.
let requestedInPageSession = false;

interface LocationProviderProps {
  children: ReactNode;
}

export const LocationProvider = ({ children }: LocationProviderProps) => {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [district, setDistrict] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [errorKey, setErrorKey] = useState<LocationErrorKey | null>(null);
  const inFlightRef = useRef(false);

  const requestLocation = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setStatus('requesting');
    setErrorKey(null);

    try {
      const result = await getBrowserPosition();
      if (!result.ok) {
        if (result.error === 'permission') {
          setStatus('denied');
        } else if (result.error === 'unsupported') {
          setStatus('unsupported');
        } else {
          setStatus('unavailable'); // unavailable or timeout
        }
        setErrorKey(result.error);
        return;
      }

      const resolved = resolveDistrict(result.position.lat, result.position.lon);
      if (!resolved.isInTamilNadu) {
        // Honest unsupported-location state (no fabricated district / no weather).
        setStatus('outside-tn');
        setDistrict(null);
        return;
      }

      setCoords({ lat: result.position.lat, lon: result.position.lon });
      setDistrict(resolved.district);
      setStatus('granted');
      writeStored({
        lat: result.position.lat,
        lon: result.position.lon,
        district: resolved.district,
        isInTamilNadu: true,
      });
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Reuse a location already resolved earlier in this session (no re-prompt, no refetch).
    const stored = readStored();
    if (stored && stored.district && stored.isInTamilNadu) {
      setDistrict(stored.district);
      setCoords({ lat: stored.lat, lon: stored.lon });
      setStatus('granted');
      requestedInPageSession = true;
      return;
    }

    if (requestedInPageSession) return;
    requestedInPageSession = true;
    void requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LocationContext.Provider
      value={{
        status,
        district,
        coords,
        errorKey,
        requestLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};