import { defineConfig, passthroughImageService } from 'astro/config';

// GitHub Pages de proyecto → sirve bajo /playlistF
export default defineConfig({
  site: 'https://richard7987.github.io',
  base: '/playlistF',
  trailingSlash: 'ignore',
  image: { service: passthroughImageService() },
  devToolbar: { enabled: false },
});
