import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import i18n from './i18n';
import { AuthProvider } from './context/AuthContext';

// Keep the document's lang attribute in sync with the active UI language so screen readers
// announce text with the correct language (i18n already drives the UI strings).
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);