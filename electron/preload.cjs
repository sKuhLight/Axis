// Axis preload — contextIsolation bridge. Intentionally minimal; the UI talks to the bundled
// ForgeFX over HTTP (http://localhost:5056), so almost nothing needs to cross the bridge.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('axisDesktop', {
  isDesktop: true,
  version: process.env.npm_package_version ?? null
});

// auto-update bridge: subscribe to status events + trigger check/download/install
contextBridge.exposeInMainWorld('axisUpdate', {
  on: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on('axis-update', h);
    return () => ipcRenderer.removeListener('axis-update', h);
  },
  check: () => ipcRenderer.invoke('axis-update:check'),
  download: () => ipcRenderer.invoke('axis-update:download'),
  install: () => ipcRenderer.invoke('axis-update:install')
});
