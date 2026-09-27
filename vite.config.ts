import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app from /<repo>/, so the deploy workflow sets BASE_PATH.
// Local dev, preview and e2e run from the root.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'robots.txt'],
      manifest: {
        name: 'Mesa Viva',
        short_name: 'Mesa Viva',
        description: "Texas Hold'em contra oponentes controlados pelo computador.",
        lang: 'pt-BR',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#062a24',
        theme_color: '#062a24',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // The 3D table's code, GPU benchmark tables and models are not precached: the menu must
        // not download them (AGENTS.md §20.2). They are cached on first use instead (§26).
        globIgnores: ['assets/3d/**', 'assets/gpu/**'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/(3d|gpu)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mesa-viva-3d',
              expiration: { maxEntries: 200 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    // three.js is ~270 KB gzipped, loaded only with the 3D table.
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        chunkFileNames: (chunk) => {
          const id = chunk.facadeModuleId ?? '';
          if (id.includes('detect-gpu/dist/benchmarks')) return 'assets/gpu/[name]-[hash].js';
          if (id.includes('/src/ui/table3d/')) return 'assets/3d/[name]-[hash].js';
          return 'assets/[name]-[hash].js';
        },
      },
    },
  },
});
