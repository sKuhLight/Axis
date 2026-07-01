// Auto-update via electron-updater (GitHub releases). The user confirms the download and the install.
// In-app install works for the Linux AppImage and the Windows NSIS installer; macOS needs code-signing.
// Linux DISTRO packages (pacman / deb / rpm) can't be auto-installed by electron-updater — quitAndInstall
// is a no-op there — so we don't offer the download/restart flow for them; the renderer shows a "get it from
// GitHub" link instead (canInstall:false). No-op in dev / unpackaged.
const { app, ipcMain, BrowserWindow, shell } = require('electron');

const RELEASES_URL = 'https://github.com/sKuhLight/Axis/releases/latest';
// Auto-install only works for AppImage on Linux (electron-updater limitation); always on Windows/macOS.
const CAN_AUTO_INSTALL = process.platform !== 'linux' || !!process.env.APPIMAGE;

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

  autoUpdater.on('update-available', (info) => send('available', { version: info?.version, canInstall: CAN_AUTO_INSTALL, url: RELEASES_URL }));
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
  ipcMain.handle('axis-update:install', () => {
    // Distro packages can't be swapped by the updater — open the releases page so the user installs the
    // new package the normal way. AppImage / Windows / macOS install in place.
    if (!CAN_AUTO_INSTALL) { shell.openExternal(RELEASES_URL); return; }
    autoUpdater.quitAndInstall();
  });

  // one automatic check shortly after launch (the renderer can re-check on demand)
  setTimeout(() => autoUpdater.checkForUpdates().catch((e) => logLine(`[update] check failed: ${e?.message || e}`)), 4000);
}

module.exports = { setupUpdater };
