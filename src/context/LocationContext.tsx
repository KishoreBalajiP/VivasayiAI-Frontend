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
  type LocationDetails,
  type LocationErrorKey,
} from '../services/locationService';
import { reverseGeocode, applyReverseGeocode } from '../services/reverseGeocode';

// Browser/device location is a SESSION-level concept, separate from the farm profile
// district. After authentication the app requests permission once, resolves the device
// position to the most precise place available (coordinates + reverse-geocoded
// village/locality/town → taluk → district → state), and reuses it for the rest of the
// session (spec: "Store the resolved location appropriately so it can be reused during the
// current application session"). Weather uses the canonical district via the existing
// /weather contract. On denial/unavailability we never fabricate a location — the app
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
  // Canonical Tamil Nadu district when status === 'granted'; null otherwise (never a
  // fabricated TN district for out-of-TN coordinates). Drives the /weather contract.
  district: string | null;
  // Detected coordinates (kept for the weather card tooltip / precision), null until granted.
  coords: { lat: number; lon: number } | null;
  // Richer place model: finest reverse-geocoded details actually available. Nulls allowed.
  details: LocationDetails | null;
  // Determined failure reason when status is denied/unavailable/unsupported.
  errorKey: LocationErrorKey | null;
  requestLocation: () => Promise<void>;
}

const STORAGE_KEY = 'vivasayi.location';

interface StoredLocation {
  lat: number;
  lon: number;
  district: string | null;
  isInTamilNadu: boolean;
  displayName: string | null;
  locality: string | null;
  village: string | null;
  townCity: string | null;
  subDistrict: string | null;
  state: string | null;
  country: string | null;
  source: string | null;
}

const readStored = (): StoredLocation | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLocation;
    if (typeof parsed.lat !== 'number' || typeof parsed.lon !== 'number') {
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

const toStored = (
  details: LocationDetails,
  isInTamilNadu: boolean
): StoredLocation => ({
  lat: details.lat,
  lon: details.lon,
  district: details.district,
  isInTamilNadu,
  displayName: details.displayName,
  locality: details.locality,
  village: details.village,
  townCity: details.townCity,
  subDistrict: details.subDistrict,
  state: details.state,
  country: details.country,
  source: details.source,
});

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
  // When true (authenticated shell), location is requested once on mount without user
  // interaction. When false (public landing page), the provider hydrates a previously
  // resolved session location but never auto-prompts — the user taps "Use my location".
  autoRequest?: boolean;
}

export const LocationProvider = ({
  children,
  autoRequest = true,
}: LocationProviderProps) => {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [district, setDistrict] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [details, setDetails] = useState<LocationDetails | null>(null);
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

      const { lat, lon } = result.position;
      const resolved = resolveDistrict(lat, lon);
      const inTN = resolved.isInTamilNadu;
      const canonicalDistrict = inTN ? resolved.district : null;

      setCoords({ lat, lon });
      setDistrict(canonicalDistrict);
      setStatus(inTN ? 'granted' : 'outside-tn');

      // Provisional, honest details (canonical district only — no fabricated locality) so
      // the UI has something immediately; upgraded in place when reverse geocoding returns.
      const provisional: LocationDetails = {
        displayName: canonicalDistrict,
        locality: null,
        village: null,
        townCity: null,
        subDistrict: null,
        district: canonicalDistrict,
        state: inTN ? 'Tamil Nadu' : null,
        country: inTN ? 'India' : null,
        source: inTN ? 'districts' : null,
        lat,
        lon,
      };
      setDetails(provisional);
      writeStored(toStored(provisional, inTN));

      // Best-effort precision upgrade — never used to fabricate a district; on failure the
      // provisional (district-level for TN, honest state otherwise) remains.
      const place = await reverseGeocode(lat, lon);
      if (inFlightRef.current && place) {
        const enriched = applyReverseGeocode(place, canonicalDistrict, lat, lon);
        setDetails(enriched);
        writeStored(toStored(enriched, inTN));
      }
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Reuse a location already resolved earlier in this session (no re-prompt, no refetch).
    const stored = readStored();
    if (stored) {
      setCoords({ lat: stored.lat, lon: stored.lon });
      setDistrict(stored.district);
      setDetails({
        displayName: stored.displayName ?? stored.district,
        locality: stored.locality,
        village: stored.village,
        townCity: stored.townCity,
        subDistrict: stored.subDistrict,
        district: stored.district,
        state: stored.state,
        country: stored.country,
        source: (stored.source as LocationDetails['source']) ?? (stored.isInTamilNadu ? 'districts' : null),
        lat: stored.lat,
        lon: stored.lon,
      });
      setStatus(stored.isInTamilNadu ? 'granted' : 'outside-tn');
      requestedInPageSession = true;
      return;
    }

    if (requestedInPageSession) return;
    if (!autoRequest) return;
    requestedInPageSession = true;
    void requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRequest]);

  return (
    <LocationContext.Provider
      value={{
        status,
        district,
        coords,
        details,
        errorKey,
        requestLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};