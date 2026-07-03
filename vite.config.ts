import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // expose the package version to the client (used by the in-app update checker)
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    rollupOptions: {
      // forgefx-midi's Node serial connector holds a LAZY `import('serialport')` that is only reachable
      // behind a Node-only connect call — Browser Direct injects Web MIDI/Serial transports instead, so
      // it never executes in the browser. Rollup insists on resolving it anyway; mark it external.
      external: ['serialport']
    }
  },
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
