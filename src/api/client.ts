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
// - Supports JSON and FormData bodies so multipart uploads (Phase 5) need no redesign.
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
export const friendlyMessageKey = (status: number): string => {
  switch (status) {
    case 401:
      return 'authExpired';
    case 404:
      return 'notFound';
    case 413:
      // The backend enforces its upload cap via HTTP 413 (multer LIMIT_FILE_SIZE → ApiError
      // "Image exceeds the maximum allowed size"). Specific enough to map app-wide.
      return 'imageTooLarge';
    case 429:
      return 'rateLimited';
    case 0:
      return 'networkError';
    default:
      return 'serverError';
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