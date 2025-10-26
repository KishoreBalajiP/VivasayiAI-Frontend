export const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  cognito: {
    domain: import.meta.env.VITE_COGNITO_DOMAIN || '',
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
    redirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI || window.location.origin,
  }
};
