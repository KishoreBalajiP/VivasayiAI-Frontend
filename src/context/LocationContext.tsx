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
  type LocationDetails,
  type LocationErrorKey,
} from '../services/locationService';
import { reverseGeocode, applyReverseGeocode } from '../services/reverseGeocode';
import { classifyDeviceLocation, type TnPrecision } from '../services/tnClassifier';

// Browser/device location is a SESSION-level, OPT-IN concept, separate from the farm profile
// district. Farm-first (plan B6): the header, the default weather and every claim screen use the
// profile's farm district. The device position is requested only when the farmer asks for it
// ("Use my current location" in the weather strip, or "My location" on the parcel map), then
// resolved with services/tnClassifier.ts (widened box + reverse-geocoded state) and reused for
// the rest of the session. On denial/unavailability we never fabricate a location.

export type LocationStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'unsupported'
  | 'outside-tn';

export interface LocationContextValue {
  // `granted` covers both a geocoder-confirmed Tamil Nadu fix and an "approximate" one (the
  // geocoder failed inside the box); `precision` tells them apart. `outside-tn` is used only when
  // the geocoder named another state/country, or the fix is outside the box.
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
  // How the in/out decision was made; null until a fix exists. Optional so lightweight test
  // doubles of this context keep compiling.
  precision?: TnPrecision | null;
  // State the geocoder reported (e.g. "Andhra Pradesh" when outside); null when unknown.
  stateName?: string | null;
  requestLocation: () => Promise<void>;
}

// v2: the classifier changed what "inside Tamil Nadu" means, so v1 entries (bare-rectangle
// verdicts such as Bengaluru = Tamil Nadu) are ignored and removed, never trusted.
const STORAGE_KEY = 'vivasayi.location.v2';
const LEGACY_STORAGE_KEY = 'vivasayi.location';

interface StoredLocation {
  v: 2;
  lat: number;
  lon: number;
  district: string | null;
  inTamilNadu: true | false | 'approximate';
  precision: TnPrecision;
  stateName: string | null;
  displayName: string | null;
  locality: string | null;
  village: string | null;
  townCity: string | null;
  subDistrict: string | null;
  state: string | null;
  country: string | null;
  source: LocationDetails['source'];
}

const readStored = (): StoredLocation | null => {
  try {
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLocation;
    if (
      parsed?.v !== 2 ||
      typeof parsed.lat !== 'number' ||
      typeof parsed.lon !== 'number' ||
      !(parsed.inTamilNadu === true || parsed.inTamilNadu === false || parsed.inTamilNadu === 'approximate')
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

/**
 * Optional variant for components that must work with or without a provider — the parcel map's
 * "my location" control degrades to search-only instead of throwing when no provider is mounted.
 */
// eslint-disable-next-line react-refresh/only-export-components -- standard provider+hook pattern (cf. AuthContext.tsx)
export const useOptionalLocation = (): LocationContextValue | null =>
  useContext(LocationContext) ?? null;

export { LocationContext };

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
  // Opt-in only. When true, location is requested once on mount without user interaction; the
  // app shell and landing page both pass false (farm-first), and false is now the default.
  // Either way a location resolved earlier in the session is hydrated without a prompt.
  autoRequest?: boolean;
}

export const LocationProvider = ({
  children,
  autoRequest = false,
}: LocationProviderProps) => {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [district, setDistrict] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [details, setDetails] = useState<LocationDetails | null>(null);
  const [errorKey, setErrorKey] = useState<LocationErrorKey | null>(null);
  const [precision, setPrecision] = useState<TnPrecision | null>(null);
  const [stateName, setStateName] = useState<string | null>(null);
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
      // The reverse-geocoded state decides inside the widened box; a geocoder failure resolves
      // to "approximate inside", never to "outside".
      const verdict = await classifyDeviceLocation(lat, lon, reverseGeocode);
      const inside = verdict.inTamilNadu !== false;
      const canonicalDistrict = inside ? verdict.district : null;

      const resolved: LocationDetails = verdict.place
        ? applyReverseGeocode(verdict.place, canonicalDistrict, lat, lon)
        : {
            // Honest district-level details only (no fabricated locality or state).
            displayName: canonicalDistrict,
            locality: null,
            village: null,
            townCity: null,
            subDistrict: null,
            district: canonicalDistrict,
            state: null,
            country: null,
            source: inside ? 'districts' : null,
            lat,
            lon,
          };

      setCoords({ lat, lon });
      setDistrict(canonicalDistrict);
      setDetails(resolved);
      setPrecision(verdict.precision);
      setStateName(verdict.stateName);
      setStatus(inside ? 'granted' : 'outside-tn');

      writeStored({
        v: 2,
        lat,
        lon,
        district: canonicalDistrict,
        inTamilNadu: verdict.inTamilNadu,
        precision: verdict.precision,
        stateName: verdict.stateName,
        displayName: resolved.displayName,
        locality: resolved.locality,
        village: resolved.village,
        townCity: resolved.townCity,
        subDistrict: resolved.subDistrict,
        state: resolved.state,
        country: resolved.country,
        source: resolved.source,
      });
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Reuse a location already resolved earlier in this session (no re-prompt, no refetch).
    const stored = readStored();
    if (stored) {
      const inside = stored.inTamilNadu !== false;
      setCoords({ lat: stored.lat, lon: stored.lon });
      setDistrict(inside ? stored.district : null);
      setDetails({
        displayName: stored.displayName ?? stored.district,
        locality: stored.locality,
        village: stored.village,
        townCity: stored.townCity,
        subDistrict: stored.subDistrict,
        district: stored.district,
        state: stored.state,
        country: stored.country,
        source: stored.source ?? (inside ? 'districts' : null),
        lat: stored.lat,
        lon: stored.lon,
      });
      setPrecision(stored.precision ?? null);
      setStateName(stored.stateName ?? null);
      setStatus(inside ? 'granted' : 'outside-tn');
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
        precision,
        stateName,
        requestLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};
