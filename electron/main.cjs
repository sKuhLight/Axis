// Axis desktop shell (Electron). One app: it starts the bundled ForgeFX server in-process
// (so the native `serialport` runs under Electron's Node) and loads the Axis UI *served by that
// same server over http* — which sidesteps SvelteKit's absolute /_app/ asset paths under file://.
// No separate install — ForgeFX + the built UI are shipped inside the app.
const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const { setupUpdater } = require('./updater.cjs');
const path = require('node:path');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

const DEV = process.env.ELECTRON_DEV === '1' || !app.isPackaged;

// ── debug log ──────────────────────────────────────────────────────────────
// One self-contained .txt per launch capturing EVERYTHING a tester would need to send us:
// ForgeFX (runs in-process → its pino/console output goes to our stdout) + the Axis renderer
// console + a startup diagnostic (platform, MIDI availability, all serial + MIDI in/out ports,
// connection resolution). Auto-saved to the OS logs dir; openable from Help → Open Debug Log.
let logStream = null;
let logFilePath = '';
function initLog() {
  try {
    const dir = app.getPath('logs');
    fs.mkdirSync(dir, { recursive: true });
    logFilePath = path.join(dir, 'axis-debug.txt');
    logStream = fs.createWriteStream(logFilePath, { flags: 'w' }); // fresh each launch
  } catch (e) {
    return;
  }
  logStream.write(
    [
      '=== Axis debug log ===',
      `time:     ${new Date().toISOString()}`,
      `app:      Axis ${app.getVersion()}`,
      `runtime:  electron ${process.versions.electron} · node ${process.versions.node} · napi ${process.versions.napi} · chrome ${process.versions.chrome}`,
      `os:       ${process.platform} ${process.arch} · ${os.release()}`,
      `packaged: ${app.isPackaged}`,
      `forgefx:  ${forgefxRoot}`,
      `log file: ${logFilePath}`,
      '',
      '— send this file when reporting an issue —',
      ''
    ].join('\n')
  );
  // tee stdout + stderr (captures ForgeFX's logger + every console.* in the main process)
  for (const name of ['stdout', 'stderr']) {
    const orig = process[name].write.bind(process[name]);
    process[name].write = (chunk, enc, cb) => {
      try {
        logStream.write(typeof chunk === 'string' ? chunk : chunk.toString());
      } catch {
        /* */
      }
      return orig(chunk, enc, cb);
    };
  }
  process.on('uncaughtException', (e) => logLine(`[main] uncaughtException: ${e?.stack || e}`));
  process.on('unhandledRejection', (e) => logLine(`[main] unhandledRejection: ${e?.stack || e}`));
}
function logLine(s) {
  try {
    logStream && logStream.write(s + '\n');
  } catch {
    /* */
  }
}
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
  process.env.FORGEFX_DATA_DIR = process.env.FORGEFX_DATA_DIR || path.join(app.getPath('userData'), 'store'); // Axis config + backups
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
  // mirror the Axis renderer console into the debug log
  const LV = ['verbose', 'info', 'warning', 'error'];
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const src = sourceId ? ` (${String(sourceId).split('/').pop()}:${line})` : '';
    logLine(`[ui:${LV[level] || level}] ${message}${src}`);
  });
  win.webContents.on('render-process-gone', (_e, d) => logLine(`[ui] render-process-gone: ${JSON.stringify(d)}`));
  // open external links (Ko-fi, GitHub) in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  // DEV → the Vite dev server; packaged → the engine-served SPA
  win.loadURL(DEV ? 'http://localhost:5173' : ORIGIN);
}

async function logDiagnostics() {
  try {
    const r = await fetch(`${ORIGIN}/diag`);
    const d = await r.json();
    logLine('\n=== ForgeFX diagnostics (/diag) ===\n' + JSON.stringify(d, null, 2) + '\n');
  } catch (e) {
    logLine(`[main] could not fetch /diag: ${e?.message || e}`);
  }
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Help',
      submenu: [
        { label: 'Open Debug Log', click: () => logFilePath && shell.openPath(logFilePath) },
        { label: 'Show Log Folder', click: () => logFilePath && shell.showItemInFolder(logFilePath) },
        { type: 'separator' },
        { label: 'Axis on GitHub', click: () => shell.openExternal('https://github.com/sKuhLight/Axis') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  initLog();
  buildMenu();
  if (!DEV) {
    PORT = String(await pickPort(Number(PORT)));
    ORIGIN = `http://localhost:${PORT}`;
  }
  await startForgeFX();
  if (!DEV) await waitForServer();
  await logDiagnostics();
  createWindow();
  setupUpdater(logLine); // auto-update from GitHub releases (packaged builds only)
  // Let the renderer read this session's debug log (it can't touch the FS directly) — for the
  // "Upload Debug Log" diagnostics report. Returns the current contents, or '' if unavailable.
  ipcMain.handle('axis:read-debug-log', () => {
    try { return logFilePath ? fs.readFileSync(logFilePath, 'utf8') : ''; } catch { return ''; }
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
