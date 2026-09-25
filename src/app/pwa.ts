import { registerSW } from 'virtual:pwa-register';

/** Registers the service worker that makes the app installable and offline-capable. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  registerSW({ immediate: true });
}
