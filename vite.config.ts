import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: '5x5',
        short_name: '5x5',
        description: 'Personal StrongLifts 5x5 training log.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0E1216',
        theme_color: '#0E1216',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        // App shell + all IndexedDB-backed data lives on-device; once cached,
        // the app must keep working with the dev/host machine off entirely.
        runtimeCaching: [],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    host: true,
  },
});
