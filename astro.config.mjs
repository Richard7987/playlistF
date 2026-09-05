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
        globPatterns: ['**/*.{html,js,css,woff2,webp,svg}'],
        navigateFallback: '/playlistF/index.html',
        navigateFallbackDenylist: [/^\/playlistF\/editor/],
      },
      devOptions: { enabled: false },
    }),
  ],
});
