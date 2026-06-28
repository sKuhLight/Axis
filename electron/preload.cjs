// Axis preload — contextIsolation bridge. Intentionally minimal; the UI talks to the bundled
// ForgeFX over HTTP (http://localhost:5056), so almost nothing needs to cross the bridge.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('axisDesktop', {
  isDesktop: true,
  version: process.env.npm_package_version ?? null
});
