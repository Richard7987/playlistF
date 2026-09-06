import { defineConfig, passthroughImageService } from 'astro/config';
import AstroPWA from '@vite-pwa/astro';

// GitHub Pages de proyecto → sirve bajo /playlistF
export default defineConfig({
  site: 'https://richard7987.github.io',
  base: '/playlistF',
  trailingSlash: 'ignore',
  image: { service: passthroughImageService() },
  devToolbar: { enabled: false },
  integrations: [
    AstroPWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      manifest: {
        name: 'Fa',
        short_name: 'Fa',
        description: 'Una playlist, hecha web.',
        start_url: '/playlistF/',
        scope: '/playlistF/',
        display: 'standalone',
        background_color: '#08070b',
        theme_color: '#08070b',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,woff2,webp,svg}'],
        navigateFallbackDenylist: [/^\/playlistF\/editor/],
        runtimeCaching: [
          {
            // el HTML lleva las URLs de streaming embebidas: siempre red primero
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'html', networkTimeoutSeconds: 4, expiration: { maxEntries: 8 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
