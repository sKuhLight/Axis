// Axis desktop shell (Electron). One app: it starts the bundled ForgeFX server in-process
// (so the native `serialport` runs under Electron's Node) and loads the built Axis UI, which
// talks to that local server. No separate install — ForgeFX is shipped inside the app.
const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

const DEV = process.env.ELECTRON_DEV === '1' || !app.isPackaged;
const PORT = process.env.PORT || '5056';

// Where the bundled ForgeFX lives: packaged → resources/forgefx; dev → the sibling repo.
const forgefxRoot = DEV ? path.join(__dirname, '..', '..', 'ForgeFX') : path.join(process.resourcesPath, 'forgefx');

function startForgeFX() {
  process.env.PORT = PORT;
  process.env.FORGEFX_DEFINITIONS = path.join(forgefxRoot, 'definitions');
  try {
    // run the Fastify server in this (Node) process — native serial works under Electron's ABI
    require(path.join(forgefxRoot, 'server', 'dist', 'index.js'));
    console.log('[axis] ForgeFX started on :' + PORT);
  } catch (err) {
    console.error('[axis] failed to start ForgeFX:', err);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0c0c0e',
    autoHideMenuBar: true,
    title: 'Axis',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });
  // open external links in the system browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'build', 'index.html'));
}

app.whenReady().then(() => {
  startForgeFX();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
