/**
 * Renders the PWA PNG icons from an original inline SVG design.
 * Run with `npm run icons` after changing the artwork; the PNGs are committed.
 */
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

const FELT = `<radialGradient id="felt" cx="50%" cy="40%" r="70%">
  <stop offset="0" stop-color="#0f6b58"/><stop offset="1" stop-color="#062a24"/></radialGradient>`;
const GOLD = `<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#f3d98b"/><stop offset="1" stop-color="#c9a24a"/></linearGradient>`;
const SPADE =
  'M50 20C36 36 25 44 25 57c0 9 7 15 15 15 4 0 7-2 9-5-1 6-3 10-7 13h16c-4-3-6-7-7-13 2 3 5 5 9 5 8 0 15-6 15-15 0-13-11-21-25-37z';

function svg(maskable: boolean): string {
  // Maskable icons keep the artwork inside the central 80% safe zone and fill the whole square.
  const art = maskable
    ? `<g transform="translate(50 50) scale(0.72) translate(-50 -50)">
         <circle cx="50" cy="50" r="40" fill="none" stroke="url(#gold)" stroke-width="3"/>
         <path fill="url(#gold)" d="${SPADE}"/></g>`
    : `<circle cx="50" cy="50" r="40" fill="none" stroke="url(#gold)" stroke-width="3"/>
       <path fill="url(#gold)" d="${SPADE}"/>`;
  const radius = maskable ? 0 : 22;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
    <defs>${FELT}${GOLD}</defs>
    <rect width="100" height="100" rx="${radius}" fill="url(#felt)"/>${art}</svg>`;
}

const targets = [
  { file: 'public/pwa-192x192.png', size: 192, maskable: false },
  { file: 'public/pwa-512x512.png', size: 512, maskable: false },
  { file: 'public/pwa-512x512-maskable.png', size: 512, maskable: true },
  { file: 'public/apple-touch-icon.png', size: 180, maskable: true },
];

const sandboxChromium = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (!existsSync(chromium.executablePath()) && existsSync(sandboxChromium)
    ? sandboxChromium
    : undefined);

const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  for (const { file, size, maskable } of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg(maskable)}</body></html>`,
    );
    await page.screenshot({ path: file, omitBackground: true });
    await page.close();
    console.log(`wrote ${file}`);
  }
} finally {
  await browser.close();
}
