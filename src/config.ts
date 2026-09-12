export const config = {
  // Backend API base URL. Backend runs on :8000 (see .env) — the fallback is only for
  // builds where VITE_API_URL was not provided. All API calls go through src/api/client.ts.
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  cognito: {
    domain: import.meta.env.VITE_COGNITO_DOMAIN || '',
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
    redirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI || window.location.origin,
  },
  auth: {
    // Namespace for client-side auth storage (sessionStorage / in-memory fallback).
    storageKeyPrefix: 'vivasayi.auth',
  },
};