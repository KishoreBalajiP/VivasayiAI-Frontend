// The backend access token is a short-lived JWT. We cannot verify its signature in the
// browser, but we can read `exp` to skip a doomed API call after expiry (a 401 then takes
// over as the authoritative path back to login).
//
// The payload segment is base64url (RFC 7515): `-` and `_` instead of `+` and `/`, no padding, and
// UTF-8 inside. Plain `atob` rejects `-`/`_`, which appear whenever the payload carries non-ASCII
// text such as a Tamil name, so such a valid session was wrongly treated as expired.
export const decodeJwtPayload = (token: string): Record<string, unknown> => {
  const segment = token.split('.')[1] ?? '';
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
};

export const isBackendTokenExpired = (token: string): boolean => {
  try {
    const payload = decodeJwtPayload(token);
    return typeof payload.exp === 'number' && Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
};
