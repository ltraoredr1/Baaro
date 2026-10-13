import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'BAARO — Réseau Social',
        short_name: 'BAARO',
        description: 'Réseau social nouvelle génération avec feed, live, marketplace et IA',
        theme_color: '#D9AE52',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        scope: './',
        start_url: './',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/node_modules/**/*', 'sw.js', 'workbox-*.js'],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        manualChunks(id) {
          // Code applicatif (lazy chunks)
          if (!id.includes('node_modules')) {
            if (id.includes('DiscoverHub')) return 'discover';
            if (id.includes('CommunityTab') || id.includes('EnterprisesTab')) return 'community';
            if (id.includes('VideoTranslate')) return 'video';
            if (id.includes('EngagementList') || id.includes('FriendRequest')) return 'social';
            return null;
          }

          // React + dépendances critiques → même chunk (évite createContext undefined)
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/') ||
            id.includes('react-router') ||
            id.includes('react-redux') ||
            id.includes('@reduxjs/toolkit') ||
            id.includes('react-i18next') ||
            id.includes('i18next')
          ) {
            return 'react-vendor';
          }

          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('@capacitor')) return 'capacitor';
          if (id.includes('lucide-react') || id.includes('framer-motion')) return 'ui';

          return 'vendor';
        }
      }
    }
  }
});
