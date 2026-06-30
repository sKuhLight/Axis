// See https://svelte.dev/docs/kit/types#app
/** Desktop auto-update status event from the Electron main process. */
export interface AxisUpdateEvent {
  channel: 'available' | 'none' | 'progress' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}
declare global {
  /** App version, injected at build time from package.json (see vite.config). */
  const __APP_VERSION__: string;
  interface Window {
    axisDesktop?: { isDesktop: boolean; version: string | null };
    /** Electron auto-update bridge (desktop builds only). */
    axisUpdate?: {
      on: (cb: (e: AxisUpdateEvent) => void) => () => void;
      check: () => Promise<{ ok: boolean; error?: string }>;
      download: () => Promise<{ ok: boolean; error?: string }>;
      install: () => void;
    };
  }
  namespace App {}
}

export {};
