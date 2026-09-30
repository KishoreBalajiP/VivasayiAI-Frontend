import { GEOCODER_MIN_INTERVAL_MS } from '../config/map';

// Shared request pacing for the OpenStreetMap Nominatim PUBLIC instance.
//
// Nominatim's public service is one shared, donation-funded endpoint for the whole internet, and
// its usage policy caps callers at roughly one request per second. Every request the app makes to
// that host therefore has to pass through here — forward search (`/search`) and reverse geocoding
// (`/reverse`) alike. If each service kept its own counter, a farmer who searched and then tapped
// "My location" would produce two requests a few hundred milliseconds apart and breach the cap,
// even though each service individually looked compliant.
//
// A self-hosted or proxied endpoint (VITE_GEOCODER_URL, or a reverse geocoder pointed at the
// operator's own Nominatim) is not subject to the shared-resource cap and is not throttled here —
// that is the operator's capacity decision.

const PUBLIC_GEOCODER_HOST = 'nominatim.openstreetmap.org';

/** True when `url` points at the shared public instance (any path: /search or /reverse). */
export const isPublicGeocoderUrl = (url: string): boolean => {
  try {
    return new URL(url).hostname.toLowerCase() === PUBLIC_GEOCODER_HOST;
  } catch {
    // An unparseable endpoint cannot be identified as the public one, so do not throttle it.
    return false;
  }
};

/**
 * Timestamp (ms) at which the last request to the public instance was allowed to start. Module
 * scope so the cap holds across every caller and across component remounts.
 */
let lastRequestStartedAt = 0;

/**
 * Serialises slot claiming.
 *
 * This chain is what makes the cap actually hold. A plain `lastRequestStartedAt` check is NOT
 * enough: two requests that arrive while a slot is still queued both read the same stale timestamp,
 * both conclude they may go now, and both fire together — exactly the burst the policy forbids.
 * Chaining makes each participant claim its slot only after the previous one has claimed its own.
 */
let rateLimitChain: Promise<void> = Promise.resolve();

/** Rejects as soon as `signal` aborts, so a queued request is abandoned instead of sent late. */
const delay = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Wait this request's turn against the public instance, then claim the slot by stamping the start
 * time. Resolves immediately for a non-public endpoint.
 *
 * Pacing on the request START (rather than on response completion) is what bounds the request
 * RATE, which is what the policy measures — waiting for responses instead would let a burst of
 * concurrent requests straight through. A participant that aborts while queued never stamps the
 * clock, because no request was sent, so the next one is paced from the previous real request
 * rather than from a phantom one.
 *
 * @throws AbortError if `signal` aborts while queued.
 */
export const claimGeocoderSlot = async (
  url: string,
  signal: AbortSignal,
  minIntervalMs?: number,
): Promise<void> => {
  const interval =
    minIntervalMs ?? (isPublicGeocoderUrl(url) ? GEOCODER_MIN_INTERVAL_MS : 0);
  if (interval <= 0) return;

  const claim = rateLimitChain.then(async () => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const waitMs = lastRequestStartedAt + interval - Date.now();
    if (waitMs > 0) await delay(waitMs, signal);
    lastRequestStartedAt = Date.now();
  });
  // Keep the queue alive for later callers regardless of this participant's outcome.
  rateLimitChain = claim.then(
    () => undefined,
    () => undefined,
  );
  await claim;
};

/**
 * Reset the pacing state. Exported for tests only; not part of the component-facing API. Without
 * this, module state would leak between tests and make them order-dependent.
 */
export const resetGeocoderPacing = (): void => {
  lastRequestStartedAt = 0;
  rateLimitChain = Promise.resolve();
};
