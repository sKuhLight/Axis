# Axis

[![ci](https://github.com/sKuhLight/Axis/actions/workflows/ci.yml/badge.svg)](https://github.com/sKuhLight/Axis/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support-72a4f2?logo=ko-fi&logoColor=white)](https://ko-fi.com/R5R6223HMO)

A fast, touch-friendly editor for **Fractal Audio** devices (FM3 first) — the visual front end for
**[ForgeFX](https://github.com/sKuhLight/ForgeFX)**. Axis is a SvelteKit app that decodes and edits
the **live preset off the device**: the real routing grid, every block, a widget-grid control
surface you can rearrange, real EQ editors, a cab IR / DynaCab picker, tuner, tempo, and scenes.

The **desktop app bundles ForgeFX**, so it's one install — plug in your unit and go, on Windows,
macOS, or Linux.

> **Status:** community **beta**, hardware-verified on **FM3 firmware 12.0**. Field testers welcome.

> ⚠️ **Independent, third-party project — not affiliated with or endorsed by Fractal Audio
> Systems. Use at your own risk.** Always back up your presets. See [DISCLAIMER.md](./DISCLAIMER.md).

## Install (desktop app)

Grab the installer for your OS from the [latest release](https://github.com/sKuhLight/Axis/releases)
— Windows (`.exe`), macOS (`.dmg`), Linux (`.AppImage` / `.deb`). It includes the ForgeFX engine;
no separate setup. Connect your FM3 over USB and launch.

> On Windows the FM3 is a COM port via Fractal's USB driver; on Linux/macOS it's native CDC, no
> driver needed. Quit Fractal's FM3-Edit (or any other editor) first — only one app can hold the port.

## Run (dev)

Requires **Node 20+**. Axis talks to a running ForgeFX server.

```bash
# 1) start ForgeFX (sibling repo) — owns the serial port
cd ../ForgeFX/server && npm install && npm run dev      # http://localhost:5056

# 2) start Axis
npm install
npm run dev        # http://localhost:5173  (proxies /api -> ForgeFX on :5056)
```

Override the API base with `VITE_FORGEFX_BASE` (see `.env.example`).

### Desktop dev / build

```bash
npm run electron:dev      # runs Electron against the Vite dev server + sibling ../ForgeFX
npm run desktop:build     # builds the UI + packages the app (needs ../ForgeFX built; see electron-builder.yml)
```

The release workflow builds the installers for all three OSes on tag push.

## Build (web SPA)

```bash
npm run build      # -> build/  (static SPA; ForgeFX can serve it for a headless/Pi setup)
```

## Layout

- `src/lib/forgefx.ts` — typed ForgeFX API client (device, blocks, preset/grid, params, cab, telemetry)
- `src/lib/editor.svelte.ts` — central runes store (grid, params, telemetry, device auto-detect)
- `src/lib/ControlSurface.svelte` — the widget-grid control surface (pages, per-control views, arrange)
- `src/lib/SignalGrid.svelte` · `BlockEditor.svelte` · `CabPicker.svelte` · `EQGraph.svelte` — UI
- `src/routes/+page.svelte` — app shell: tool rail · top bar · Signal Grid · editor
- `electron/` — desktop shell (starts the bundled ForgeFX in-process, opens the window)
- `design/` — the design prototypes (visual reference, not built)

## Design language

Dark, pro-audio. **Hanken Grotesk** (UI) + **JetBrains Mono** (technical). Accent cyan `#35c9d6`,
amber `#f5a623`, coral `#d6543f` (bypass/destructive) on layered near-black.

## Support

Axis is free and open source. If it's useful to you, you can support development on Ko-fi:

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/R5R6223HMO)

## License

MIT — see [`LICENSE`](./LICENSE). Axis is an independent project and is **not affiliated with or
endorsed by Fractal Audio Systems**. "Axe-Fx", "FM3", and "FM9" are trademarks of Fractal Audio
Systems, used for identification only. See [DISCLAIMER.md](./DISCLAIMER.md).
