// Axis preload — contextIsolation bridge. Intentionally minimal; the UI talks to the bundled
// ForgeFX over HTTP (http://localhost:5056), so almost nothing needs to cross the bridge.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('axisDesktop', {
  isDesktop: true,
  version: process.env.npm_package_version ?? null,
  // read this session's debug log (axis-debug.txt) for the "Upload Debug Log" report; '' if unavailable
  readDebugLog: () => ipcRenderer.invoke('axis:read-debug-log'),
  // open an external https URL (legal pages, etc.) in the OS browser, not an in-app window
  openExternal: (url) => ipcRenderer.invoke('axis:open-external', url),
  // edit-buffer dirty flag → main shows the native "Unsaved changes" dialog on window close
  setDirty: (dirty) => ipcRenderer.send('axis:set-dirty', !!dirty),
  // native directory picker (local storage root) — returns the absolute path, or null if cancelled
  pickFolder: () => ipcRenderer.invoke('axis:pick-folder')
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
