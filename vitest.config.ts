import { defineConfig } from 'vitest/config';

// Standalone from vite.config.ts on purpose: the app's Vite config loads the SvelteKit plugin, which
// we don't want in unit tests. These are plain TS units (transports, OTA compat) with mocked native
// plugins — node environment, no DOM.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
