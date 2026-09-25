import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { strings } from '../i18n/index.ts';
import { Placeholder } from '../ui/screens/Placeholder.tsx';
import { registerServiceWorker } from './pwa.ts';
import '../ui/theme/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

document.title = strings.app.name;

createRoot(root).render(
  <StrictMode>
    <Placeholder />
  </StrictMode>,
);

if (import.meta.env.PROD) registerServiceWorker();
