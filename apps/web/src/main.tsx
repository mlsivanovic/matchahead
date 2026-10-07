import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import { activeThemePreference, applyDocumentTheme, rememberThemePreference, themeFromPrefsJson, watchDocumentTheme } from './logic/theme.ts';
import { DEVICE_PREFS_KEY, ensureAccessibleStorage } from './logic/user-local.ts';
import './styles.css';

ensureAccessibleStorage(window);

function storedThemePreference() {
  try {
    return themeFromPrefsJson(localStorage.getItem(DEVICE_PREFS_KEY));
  } catch {
    return 'auto' as const;
  }
}

rememberThemePreference(storedThemePreference());
try {
  watchDocumentTheme(
    document,
    () => activeThemePreference(),
    window.matchMedia('(prefers-color-scheme: dark)'),
  );
} catch {
  applyDocumentTheme(document, activeThemePreference(), false);
}

const root = document.querySelector('#root');
if (!root) throw new Error('Nedostaje #root.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
