// Axis desktop shell (Electron). One app: it starts the bundled ForgeFX server in-process
// (so the native `serialport` runs under Electron's Node) and loads the Axis UI *served by that
// same server over http* — which sidesteps SvelteKit's absolute /_app/ asset paths under file://.
// No separate install — ForgeFX + the built UI are shipped inside the app.
const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const net = require('node:net');
const { pathToFileURL } = require('node:url');

const DEV = process.env.ELECTRON_DEV === '1' || !app.isPackaged;
let PORT = process.env.PORT || '5056';
let ORIGIN = `http://localhost:${PORT}`;

// Bundled locations: packaged → resources/…; dev → the sibling ForgeFX repo + this repo's build.
const forgefxRoot = DEV ? path.join(__dirname, '..', '..', 'ForgeFX') : path.join(process.resourcesPath, 'forgefx');
const staticDir = DEV ? path.join(__dirname, '..', 'build') : path.join(process.resourcesPath, 'axis-ui');

// Find a usable port: prefer 5056, but if it's blocked, let the OS hand us a free one — so the
// app always starts. The UI is served by this same port (same-origin), so Axis finds it for free.
function pickPort(preferred) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => {
      const any = net.createServer();
      any.listen(0, '127.0.0.1', () => {
        const p = any.address().port;
        any.close(() => resolve(p));
      });
    });
    probe.listen(preferred, '127.0.0.1', () => probe.close(() => resolve(preferred)));
  });
}

async function startForgeFX() {
  process.env.PORT = PORT;
  process.env.FORGEFX_DEFINITIONS = path.join(forgefxRoot, 'definitions');
  process.env.FORGEFX_STATIC = staticDir; // serve the Axis SPA from the engine
  try {
    // ForgeFX is ESM — load it with dynamic import (require() can't load ES modules).
    // It runs the Fastify server in this (Node) process; native serial works under Electron's ABI.
    await import(pathToFileURL(path.join(forgefxRoot, 'server', 'dist', 'index.js')).href);
    console.log('[axis] ForgeFX started on ' + ORIGIN);
  } catch (err) {
    console.error('[axis] failed to start ForgeFX:', err);
  }
}

// wait until the server answers before loading the window (listen() resolves async)
async function waitForServer(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${ORIGIN}/healthz`);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
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
  // open external links (Ko-fi, GitHub) in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  // DEV → the Vite dev server; packaged → the engine-served SPA
  win.loadURL(DEV ? 'http://localhost:5173' : ORIGIN);
}

app.whenReady().then(async () => {
  if (!DEV) {
    PORT = String(await pickPort(Number(PORT)));
    ORIGIN = `http://localhost:${PORT}`;
  }
  await startForgeFX();
  if (!DEV) await waitForServer();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
