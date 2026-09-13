export const config = {
  // Backend API base URL. REQUIRED via VITE_API_URL (see .env.example). There is NO
  // localhost fallback: production must never silently target a development host. When the
  // variable is unset, requests resolve against the same origin (relative paths) and surface
  // through the app's normal error/retry states instead of reaching a hardcoded dev host.
  // All API calls go through src/api/client.ts.
  apiUrl: import.meta.env.VITE_API_URL || '',
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