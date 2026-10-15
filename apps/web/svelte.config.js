import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    files: { routes: 'src/app/routes', appTemplate: 'src/app/app.html' },
    alias: {
      '@pages': 'src/pages',
      '@features': 'src/features',
      '@shared': 'src/shared',
      '@entities': 'src/entities',
    },
  },
};
