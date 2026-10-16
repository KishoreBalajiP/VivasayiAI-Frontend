import { config } from '../config';
import type { ApiEnvelope } from '../types';

// Central authenticated API client.
//
// - Owns the backend access token (single source of truth).
// - Attaches `Authorization: Bearer <backend-access-token>` to every request when present.
//   The backend access token is the HS256 token issued by POST /auth/google — never the
//   Cognito id_token.
// - Parses the backend's `{ statusCode, message, data }` envelope and preserves HTTP status.
// - Throws typed ApiClientError with a user-safe message key (never raw backend internals).
// - Supports JSON and FormData bodies. Image uploads no longer use multipart (they go
//   browser → S3 via presigned URLs); FormData support is retained for any raw-field use.
//
// Token storage: sessionStorage with an in-memory fallback. Rationale is documented in the
// Phase 1 report; the token is short-lived (15 min, no refresh endpoint), so sessionStorage
// keeps the user signed in across reloads within the tab without persisting the credential
// to disk across browser restarts the way localStorage would.

const ACCESS_TOKEN_KEY = `${config.auth.storageKeyPrefix}:accessToken`;

let accessToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
  if (typeof sessionStorage !== 'undefined') {
    try {
      if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
      else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    } catch {
      // storage unavailable — token lives in memory for this page only
    }
  }
};

export const getAccessToken = (): string | null => {
  if (accessToken !== null) return accessToken;
  if (typeof sessionStorage === 'undefined') return null;
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    stored = null;
  }
  accessToken = stored;
  return stored;
};

export const clearAuthState = (): void => {
  accessToken = null;
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    } catch {
      // ignore
    }
  }
};

// Register a handler invoked when any API call receives a 401. The app uses this to
// transition to the unauthenticated state (there is no /auth/refresh endpoint yet, so the
// correct behavior is to route the user back to login rather than auto-refresh in a loop).
export const registerUnauthorizedHandler = (handler: () => void): void => {
  unauthorizedHandler = handler;
};

export class ApiClientError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
  }
}

// Maps an HTTP status (0 = network/timeout/abort) to an i18n key with a user-safe message.
// Raw backend messages are never shown directly.
//
// `context: 'image'` marks an image-upload call: there a 413 is the backend's upload cap
// (multer LIMIT_FILE_SIZE → "Image exceeds the maximum allowed size"). Anywhere else a 413 is
// the generic oversized-JSON-body response (middlewares/error.js "entity.too.large"), so it
// must not tell the farmer an image was too large.
export const friendlyMessageKey = (status: number, context?: 'image'): string => {
  switch (status) {
    case 400:
      return 'badRequest';
    case 401:
      return 'authExpired';
    case 403:
      return 'forbidden';
    case 404:
      return 'notFound';
    case 409:
      return 'conflict';
    case 413:
      return context === 'image' ? 'imageTooLarge' : 'fileTooLarge';
    case 415:
      // Unsupported content encoding/charset (middlewares/error.js) or an unsupported upload type.
      return 'unsupportedType';
    case 429:
      return 'rateLimited';
    case 503:
      // The AI provider refused the call for quota or overload (chat.service maps it to 503).
      return 'serviceBusy';
    case 0:
      return 'networkError';
    default:
      return 'serverError';
  }
};

// POST /auth/google failure → i18n key. The backend returns distinct statuses (auth.service.js):
// 401 code rejected/expired or ID token invalid, 403 email not verified, 409 email linked to a
// different account, 502 identity provider unreachable. Everything else stays `loginFailed`.
export const loginErrorKey = (status: number): string => {
  switch (status) {
    case 401:
      return 'loginCodeRejected';
    case 403:
      return 'loginEmailNotVerified';
    case 409:
      return 'loginAccountConflict';
    case 502:
      return 'loginServiceUnavailable';
    case 0:
      return 'networkError';
    default:
      return 'loginFailed';
  }
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  // Typed JSON body, or FormData for multipart (Phase 5). FormData bodies are sent as-is so
  // the browser sets the multipart boundary automatically; anything else is JSON-serialized.
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 60000;

export const request = async <T>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiEnvelope<T>> => {
  const method = options.method ?? 'GET';
  const token = getAccessToken();
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = { ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined && !isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  const externalSignal = options.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    const body =
      options.body === undefined
        ? undefined
        : isFormData
          ? (options.body as FormData)
          : JSON.stringify(options.body);
    response = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
  } catch {
    throw new ApiClientError(0, friendlyMessageKey(0));
  } finally {
    clearTimeout(timeoutId);
  }

  const handleUnauthorized = () => {
    clearAuthState();
    unauthorizedHandler?.();
  };

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    // Non-JSON or empty body — treated as malformed below.
  }

  if (!envelope || typeof envelope !== 'object') {
    if (response.status === 401) handleUnauthorized();
    throw new ApiClientError(response.status, friendlyMessageKey(response.status));
  }

  if (response.status === 401) handleUnauthorized();

  if (!response.ok) {
    throw new ApiClientError(response.status, friendlyMessageKey(response.status));
  }

  return envelope;
};