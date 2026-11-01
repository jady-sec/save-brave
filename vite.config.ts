import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      // woff2: the font must work offline. push-sw.js adds the notification handlers (public/push-sw.js).
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,png,svg}'], importScripts: ['push-sw.js'] },
      manifest: {
        name: 'Save Brave',
        short_name: 'Save Brave',
        description: 'Spend together. Save together.',
        display: 'standalone',
        start_url: '/',
        background_color: '#f47b20',
        theme_color: '#f47b20',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press the app icon (Android): jump straight to a new entry. App.tsx opens the Add sheet for ?add=1.
        shortcuts: [{ name: 'Add expense', short_name: 'Add', url: '/?add=1', icons: [{ src: 'icon-192.png', sizes: '192x192' }] }],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
});
