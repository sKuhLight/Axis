// Which build of Axis is running. Pure env reads, no side effects — the three shells (desktop, web,
// native mobile) differ only by these flags, and every consumer branches off them rather than sniffing
// the user agent.

/** True when this build is the web app (axisapp.live), not the local desktop app. The env var name
 *  predates Browser Direct, which is now the web build's only mode. */
export const isWebBuild = (): boolean => import.meta.env.VITE_AXIS_REMOTE === '1';

/** The native Capacitor shell build (iOS/Android). Reaches the device over native CoreMIDI, not
 *  Web MIDI/Serial; boots through MobileGate. See mobile.svelte.ts. */
export const isMobileBuild = (): boolean => import.meta.env.VITE_AXIS_MOBILE === '1';
