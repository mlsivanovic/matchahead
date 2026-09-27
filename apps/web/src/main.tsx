import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import './styles.css';

const root = document.querySelector('#root');
if (!root) throw new Error('Nedostaje #root.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
