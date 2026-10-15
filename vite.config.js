import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  // Chemins relatifs pour la compatibilité avec Capacitor.
  base: './',

  // Résout les imports utilisant @/, par exemple "@/theme.js".
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

      includeAssets: [
        'favicon.ico',
        'robots.txt',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
      ],

      manifest: {
        name: 'BAARO — Réseau Social',
        short_name: 'BAARO',
        description:
          'Réseau social nouvelle génération avec feed, live, marketplace et IA',
        theme_color: '#C99A2E',
        background_color: '#FAF7F0',
        display: 'standalone',
        orientation: 'portrait',

        // Configuration PWA pour un site hébergé à la racine.
        scope: '/',
        start_url: '/',

        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // Cible uniquement les fichiers présents par défaut pour éviter les alertes de glob
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg}',
        ],

        globIgnores: [
          '**/node_modules/**/*',
          'sw.js',
          'workbox-*.js',
        ],

        navigateFallback: null,

        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,

        // Mettre en cache uniquement les images de même origine.
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin &&
              /\.(?:png|jpg|jpeg|svg|gif|webp)$/i.test(
                url.pathname,
              ),

            handler: 'CacheFirst',

            options: {
              cacheName: 'baaro-images-v2',

              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },

              cacheableResponse: {
                statuses: [200],
              },
            },
          },
        ],
      },

      devOptions: {
        enabled: false,
      },
    }),
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,

    rollupOptions: {
      input: resolve(__dirname, 'index.html'),

      output: {
        manualChunks: {
          vendor: [
            'react',
            'react-dom',
            'react-router-dom',
          ],
          supabase: [
            '@supabase/supabase-js',
          ],
        },
      },
    },
  },
});
