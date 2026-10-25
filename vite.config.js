import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => ({
  // Chemins relatifs pour la compatibilité avec Capacitor.
  base: './',

  // Résout les imports utilisant @/, par exemple "@/theme.js".
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  // En production : retire console.log/debug et debugger (code plus léger).
  // console.warn et console.error restent actifs pour le diagnostic.
  esbuild:
    mode === 'production'
      ? { pure: ['console.log', 'console.debug'], drop: ['debugger'] }
      : {},

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

        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/(?!api).*/],

        // Ajoute les gestionnaires "push" et "notificationclick" au
        // service worker généré (/sw.js). Sans cela, les notifications
        // Web Push arrivent mais ne s'affichent jamais.
        importScripts: ['push-sw.js'],

        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,

        runtimeCaching: [
          // Images de même origine : cache d'abord (instantané au 2e affichage).
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

          // Polices Google (si utilisées) : feuilles de style rafraîchies en
          // arrière-plan, fichiers de police gardés un an.
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'baaro-google-fonts-css',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'baaro-google-fonts-files',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
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
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 700,

    rollupOptions: {
      input: resolve(__dirname, 'index.html'),

      output: {
        // Découpage par bibliothèque : chaque morceau reste en cache navigateur
        // d'un déploiement à l'autre, et les bibliothèques lourdes ne sont
        // téléchargées que par les écrans qui s'en servent.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor';
          }
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('@reduxjs') || id.includes('react-redux') || /[\\/]node_modules[\\/]redux/.test(id)) {
            return 'redux';
          }
          if (id.includes('@daily-co')) return 'daily';
          return undefined;
        },
      },
    },
  },
}));
