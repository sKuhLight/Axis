import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    // Axis is a pure SPA. ForgeFX serves the built files (web), and the desktop app loads them
    // over file:// — so assets must be referenced relatively, not as absolute /_app/… paths.
    adapter: adapter({ fallback: 'index.html', strict: false }),
    paths: { relative: true }
  }
};

export default config;
