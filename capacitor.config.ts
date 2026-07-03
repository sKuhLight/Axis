import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor native shell around the existing SvelteKit SPA. The web build (VITE_AXIS_MOBILE=1)
// is emitted to `build/`; `npx cap sync ios` copies it into the native project. iOS is the first
// target; Android lands later in this same repo by adding `android/` (no separate repo).
const config: CapacitorConfig = {
  appId: 'live.axisapp.axis',
  appName: 'Axis',
  webDir: 'build',
  ios: {
    // The device is reached via the native AxisMidi plugin (CoreMIDI), never Web MIDI/Serial —
    // those don't exist in WKWebView. FM3 USB-serial is intentionally out of scope on iOS.
    contentInset: 'always'
  },
  plugins: {
    // Self-hosted OTA: we drive checks manually against our own manifest (GitHub Releases), so the
    // updater's built-in auto-update to Capgo cloud is off. See src/lib/direct/ota.ts.
    CapacitorUpdater: {
      autoUpdate: false
    }
  }
};

export default config;
