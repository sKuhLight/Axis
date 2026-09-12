// Legal document URLs (hosted at axisapp.live) + a helper to open them in the user's real browser.
// In the packaged app we go through the Electron bridge (opens the OS browser, not an in-app window);
// in a plain browser build we fall back to window.open.
export const LEGAL = {
  privacy: 'https://axisapp.live/privacy',
  imprint: 'https://axisapp.live/imprint',
  terms: 'https://axisapp.live/terms'
} as const;

export function openExternal(url: string): void {
  const d = (globalThis as { axisDesktop?: { openExternal?: (u: string) => void } }).axisDesktop;
  if (d?.openExternal) d.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
