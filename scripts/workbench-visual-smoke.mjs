import { mkdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const host = '127.0.0.1';
const port = process.env.WORKBENCH_SMOKE_PORT ?? '4177';
const baseUrl = `http://${host}:${port}/`;
const outDir = new URL('../.workbench-smoke/', import.meta.url);

function spawnLogged(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

async function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function runFirefoxScreenshot(name, width, height, minBytes = 10000) {
  const file = new URL(`${name}.png`, outDir);
  const child = spawnLogged('firefox', [
    '--headless',
    `--window-size=${width},${height}`,
    '--screenshot',
    file.pathname,
    baseUrl
  ], {
    env: {
      ...process.env,
      MOZ_HEADLESS: '1'
    }
  });
  const code = await new Promise((resolve) => child.on('close', resolve));
  if (code !== 0) throw new Error(`Firefox screenshot failed for ${name} with exit code ${code}`);
  const info = await stat(file);
  if (info.size < minBytes) throw new Error(`Screenshot ${file.pathname} looks blank or incomplete (${info.size} bytes)`);
  console.log(`Captured ${file.pathname} (${info.size} bytes)`);
}

await mkdir(outDir, { recursive: true });

const server = spawnLogged('npm', ['run', 'dev', '--', '--host', host, '--port', port], {
  env: {
    ...process.env,
    VITE_AXIS_WORKBENCH: '1'
  }
});

let exitCode = 0;
try {
  await waitForServer(baseUrl);
  await runFirefoxScreenshot('desktop', 1440, 920);
  if (process.env.WORKBENCH_SMOKE_COMPACT === '1') {
    await runFirefoxScreenshot('compact', 960, 844);
  }
  if (process.env.WORKBENCH_SMOKE_PHONE === '1') {
    await runFirefoxScreenshot('phone', 390, 844);
  }
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
} finally {
  server.kill('SIGTERM');
}

process.exit(exitCode);
