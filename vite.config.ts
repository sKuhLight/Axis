import { sveltekit } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    // proxy API calls to ForgeFX during dev so the SPA can use same-origin /api paths
    proxy: {
      '/api': {
        target: 'http://localhost:5056',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, '')
      }
    }
  }
});
