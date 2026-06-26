import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    // Axis is a pure SPA; ForgeFX.Server serves the built files (one self-contained binary).
    adapter: adapter({ fallback: 'index.html', strict: false })
  }
};

export default config;
