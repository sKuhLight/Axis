// Auto-update via electron-updater (GitHub releases). The user confirms the download and the install.
// In-app updates work for the Linux AppImage and the Windows NSIS installer; macOS needs code-signing
// (until then it errors and the renderer falls back to the manual GitHub link). No-op in dev / unpackaged.
const { app, ipcMain, BrowserWindow } = require('electron');

function setupUpdater(logLine = () => {}) {
  if (!app.isPackaged) return; // dev: nothing to update

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    logLine(`[update] electron-updater unavailable: ${e?.message || e}`);
    return;
  }

  autoUpdater.autoDownload = false; // wait for the user to accept
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (m) => logLine(`[update] ${m}`),
    warn: (m) => logLine(`[update] WARN ${m}`),
    error: (m) => logLine(`[update] ERR ${m}`),
    debug: () => {}
  };

  const send = (channel, payload = {}) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('axis-update', { channel, ...payload });
  };

  autoUpdater.on('update-available', (info) => send('available', { version: info?.version }));
  autoUpdater.on('update-not-available', () => send('none'));
  autoUpdater.on('download-progress', (p) => send('progress', { percent: Math.round(p?.percent ?? 0) }));
  autoUpdater.on('update-downloaded', (info) => send('downloaded', { version: info?.version }));
  autoUpdater.on('error', (err) => send('error', { message: String(err?.message || err) }));

  ipcMain.handle('axis-update:check', async () => {
    try { await autoUpdater.checkForUpdates(); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e?.message || e) }; }
  });
  ipcMain.handle('axis-update:download', async () => {
    try { await autoUpdater.downloadUpdate(); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e?.message || e) }; }
  });
  ipcMain.handle('axis-update:install', () => { autoUpdater.quitAndInstall(); });

  // one automatic check shortly after launch (the renderer can re-check on demand)
  setTimeout(() => autoUpdater.checkForUpdates().catch((e) => logLine(`[update] check failed: ${e?.message || e}`)), 4000);
}

module.exports = { setupUpdater };
