import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { strings } from '../i18n/index.ts';
import '../ui/theme/global.css';
import { App } from './App.tsx';
import { loadRngFactory } from './load-rng-factory.ts';
import { registerServiceWorker } from './pwa.ts';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

document.title = strings.app.name;

const rngs = await loadRngFactory(globalThis.location.search);

createRoot(root).render(
  <StrictMode>
    <App rngs={rngs} />
  </StrictMode>,
);

if (import.meta.env.PROD) registerServiceWorker();
