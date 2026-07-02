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
    paths: { relative: !remote },
    // Don't auto-register the service worker. The desktop build is served same-origin over
    // http://localhost, where an SW would intercept the ForgeFX API/SSE — so we register it MANUALLY,
    // and only in the remote web build (see +layout.svelte). The bundled app stays PWA-free.
    serviceWorker: { register: false }
  }
};

export default config;
