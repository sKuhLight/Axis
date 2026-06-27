# Axis

[![ci](https://github.com/sKuhLight/Axis/actions/workflows/ci.yml/badge.svg)](https://github.com/sKuhLight/Axis/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Web frontend for **[ForgeFX](https://github.com/sKuhLight/ForgeFX)** — a control surface for Fractal devices (FM3 first). Axis is a
SvelteKit SPA that talks to the ForgeFX HTTP API; ForgeFX can serve the built files, so the
whole thing ships as one self-contained binary (PC or Raspberry Pi, on stage or desktop).

## Run (dev)
Requires Node 20+ (`sudo pacman -S nodejs npm`, or use nvm).

```bash
npm install
npm run dev        # http://localhost:5173  (proxies /api -> ForgeFX on :5056)
```

Start the ForgeFX server first (`dotnet run` in the ForgeFX repo) so `/api` resolves.
Override the API base with `VITE_FORGEFX_BASE` (see `.env.example`).

## Build (SPA)
```bash
npm run build      # -> build/  (static SPA; have ForgeFX.Server serve it)
```

## Layout
- `src/app.css` — design tokens (extracted from the prototype)
- `src/lib/forgefx.ts` — typed ForgeFX API client (`/device`, `/blocks/{slug}/...`, `/preset`, `/preset/grid`, `/preset/blocks/...`, backup/restore)
- `src/lib/types.ts` — param/block types (+ the curated UX metadata layer: `role`/`tier`/`group`)
- `src/routes/+layout.svelte` — app shell: tool rail + top bar + connection status
- `src/routes/+page.svelte` — Signal Grid + Block Editor sheet (touch: bottom sheet · desktop: right dock)
- `design/` — the Claude Design prototype (visual reference, not built)

## Design language
Dark, pro‑audio. **Hanken Grotesk** (UI) + **JetBrains Mono** (technical). Accent cyan
`#35c9d6`, amber `#f5a623`, coral `#d6543f` (bypass/destructive) on layered near‑black.

## Roadmap
UI work is tracked in [issues](https://github.com/sKuhLight/Axis/issues) (e.g. editor screens
[#1](https://github.com/sKuhLight/Axis/issues/1), real-names toggle
[#2](https://github.com/sKuhLight/Axis/issues/2)); device/protocol features live in the
[ForgeFX roadmap](https://github.com/sKuhLight/ForgeFX/blob/main/ROADMAP.md). Near-term UI ideas:

- Block gestures: swipe‑up/down = primary level (fill/grey viz), swipe‑left/right = mapped param
- Basic/Advanced global toggle (param `tier`)
- Inline Input/Output/Graphic EQ widgets (param `group`)
- Grid drag‑to‑reorder (routing), scenes/channels, preset librarian, tuner

## License
MIT — see [`LICENSE`](./LICENSE). Not affiliated with or endorsed by Fractal Audio Systems.
