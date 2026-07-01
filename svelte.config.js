import adapter from '@sveltejs/adapter-static';

// The desktop app + ForgeFX load the built files over file:// / same-origin, so assets must be referenced
// RELATIVELY there. The remote web build (axisapp.live) is hosted at a domain root and relies on SPA
// fallback for any path, so it needs ABSOLUTE asset paths instead. Switch on the remote build flag.
const remote = process.env.VITE_AXIS_REMOTE === '1';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    // Axis is a pure SPA (adapter-static, index.html fallback).
    adapter: adapter({ fallback: 'index.html', strict: false }),
    paths: { relative: !remote }
  }
};

export default config;
