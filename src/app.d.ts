// See https://svelte.dev/docs/kit/types#app
declare global {
  /** App version, injected at build time from package.json (see vite.config). */
  const __APP_VERSION__: string;
  namespace App {}
}

export {};
