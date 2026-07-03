# Axis Browser Direct — Runtime Plan

Branch (all repos): **`break-free`**

## Summary

Axis gains a new **Browser Direct** mode: open `axisapp.live`, click **Launch Axis in web**,
grant the browser access to MIDI or Serial, and control a Fractal device with **no install and
no local ForgeFX server**. The existing **Axis Remote** (relay to a host PC) stays as-is and gets
its own **Launch Axis Remote** button.

ForgeFX remains a first-class HTTP API for desktop, Docker, Raspberry Pi, scripts, and
third-party clients. The change is an internal split, not a replacement:

```text
forgefx-midi        = protocol codecs and catalogs (already pure JS; make packaging browser-safe)
ForgeFX Runtime     = device logic + API-shaped services (portable; adapters injected)
ForgeFX Server      = Fastify/Node adapter around the runtime (unchanged public HTTP API)
Axis Browser Direct = Web MIDI / Web Serial adapter around the same runtime, in-page
axis-website        = static deployment target only (landing page gains the two launch buttons)
```

Target: **full feature parity** in Browser Direct where the browser platform allows it —
including the local folder feature (File System Access API) — with per-browser gating where it
doesn't (see the support matrix below).

## What the code audit established (2026-07-03)

These facts shape the plan; they were verified against the actual sources:

- **Axis already has a pluggable transport.** `src/lib/forgefx.ts` routes every backend call
  through `req()`, which dispatches to either local HTTP or an installed
  `RemoteTransport = (rq: {method, path, body}) => Promise<{status, contentType, body}>`
  (`setRemoteTransport()`). Browser Direct is a third transport: an **in-page router** that
  answers the same `{method, path}` pairs from a runtime running in the browser. The ~40 typed
  endpoint wrappers in `forgefx.ts` need no changes.
- **Device events already have a non-SSE path.** Remote mode delivers `DeviceEvent`s via
  `editor.applyDeviceEvent()` (Realtime broadcast). Direct mode does the same from the in-page
  runtime's event bus. `#openEvents` (SSE) stays local-HTTP-only.
- **ForgeFX's device logic is already portable.** `drivers/gen3.ts`, `drivers/am4.ts`,
  `drivers/registry.ts`, `drivers/types.ts`, `devices.ts`, `help.ts`, `services/backups.ts`,
  `syncPlan.ts` import **zero Node core modules** — only `forgefx-midi` codec subpaths.
  The registry already has an injection seam (`__createRegistryForTest`) for transport/conn
  resolution; promoting that seam to a public factory is the extraction.
- **The Node-bound parts are exactly the adapters:** `transport/serial.ts` (`serialport`),
  `transport/midi.ts` (`@julusian/midi`), `store.ts` (fs + zlib brotli), `localStore.ts` (fs),
  `transport/connection.ts` (`~/.forgefx-conn`), `app.ts` (Fastify), `remote.ts`, `telemetry.ts`.
  `cloud.ts` is supabase-js + fetch — browser-viable, needing only a store adapter and a
  brotli-WASM shim for blob compression.
- **forgefx-midi is pure JS except packaging details:** fs-based JSON loaders
  (`shared/lineageLookup.ts`, `devices/gen2/lineageLookup.ts`, `core/fractal-shared/loudness.ts`,
  root `index.ts` VERSION read), `Buffer` in `am4/presetBinary.ts`, `node:crypto` in
  `devices/am4/safety/*` (not consumed by ForgeFX drivers). The Node MIDI/serial transports in
  `core/midi/` are lazy-loaded and not imported by the codec paths ForgeFX uses.
- **The web SPA deploy is one build.** `deploy-remote.yml` builds with `VITE_AXIS_REMOTE=1` and
  commits the SPA into `axis-website/public/` (root = the app, `/welcome` = landing page,
  Cloudflare Worker serves it). Browser Direct therefore ships **inside the same web build** as a
  runtime mode choice, not as a second deployment.

## Browser support matrix (honest version)

The FM3 connects over **USB-CDC serial** (Fractal interface `if03`), not USB-MIDI — so it needs
Web Serial. FM9 / Axe-Fx III / AM4 are USB-MIDI-class — they need Web MIDI (SysEx).

| Capability | Chrome/Edge desktop | Firefox desktop | Chrome Android | Safari / iOS |
|---|---|---|---|---|
| Web MIDI + SysEx (FM9, Axe-Fx III, AM4) | ✅ | ✅ (FF 108+) | ✅ | ❌ |
| Web Serial (FM3 over USB) | ✅ | ❌ | ❌ | ❌ |
| Local folder — `showDirectoryPicker()` | ✅ | ❌ → fallback | ❌ → fallback | ❌ |
| OPFS/IndexedDB store (versions, config, history) | ✅ | ✅ | ✅ | — |
| Cloud sync (supabase-js + brotli-wasm) | ✅ | ✅ | ✅ | — |

Consequences, stated plainly in the UI at connect time:

- **Chrome/Edge desktop = full parity** (all devices, real local folder, everything).
- **Firefox / Android = MIDI devices only** (FM9, Axe-Fx III, AM4; an FM3 is still reachable via
  a USB-MIDI interface on its 5-pin DIN). Local folder falls back to `.syx` file import/export +
  OPFS-backed library (no live folder mirror).
- **iOS/Safari: unsupported** for direct device access (no Web MIDI, no Web Serial). Axis Remote
  remains the iOS answer.

Feature detection at runtime (`navigator.requestMIDIAccess`, `navigator.serial`,
`window.showDirectoryPicker`), never UA sniffing.

## Phase 1 — forgefx-midi: browser-safe packaging

Small, mechanical, no API changes for existing consumers:

1. Replace fs-based JSON loading with static `import ... with { type: 'json' }` (data already
   lives in `src/**` and copies to `dist/`): `shared/lineageLookup.ts`,
   `devices/gen2/lineageLookup.ts` (also drop `createRequire`), `core/fractal-shared/loudness.ts`.
2. Root `index.ts`: stop reading `package.json` at import time; emit VERSION via the build script.
3. `am4/presetBinary.ts`: replace `Buffer` with `String.fromCharCode` / manual ASCII bytes.
4. Leave `core/midi/*` (Node transports) and `devices/am4/safety/*` (fs/crypto utilities) as-is —
   they are not on the codec import path; just make sure no browser-consumed subpath re-exports
   them.
5. Add `"sideEffects": false` and verify with a Vite build probe that importing the codec
   subpaths pulls no Node core modules.

## Phase 2 — ForgeFX: runtime extraction

Goal: the same services answer both Fastify routes (Node) and the in-page router (browser),
with the **HTTP API byte-compatible** — existing route tests must pass unchanged.

1. **Registry factory.** Promote the test seam to `createRegistry(deps)` where `deps` provides
   `resolveConn`, `openConn`, and (new) a `persistOverride` hook. Node keeps
   `transport/connection.ts`; the browser supplies Web MIDI/Serial enumeration + localStorage
   persistence.
2. **Store backend interface.** Extract the shape of `store.ts` (docs, versions, blobs) into a
   `StoreBackend` interface. Node impl = current fs code (moved, not rewritten). Browser impl =
   IndexedDB (docs + version index) with blobs as stored `Uint8Array`s; brotli via `brotli-wasm`
   so cloud blob format (`.syx.br`, content-addressed sha256) stays identical.
3. **Local folder backend interface.** Extract `localStore.ts`'s fs surface into a minimal
   `FolderAdapter` (list/read/write-atomic/mkdir/stat/exists). Node impl wraps `node:fs`;
   browser impl wraps `FileSystemDirectoryHandle` (handle persisted in IndexedDB, permission
   re-requested on load). The scan/sync/restore logic on top is already pure and moves into the
   runtime.
4. **Route → service split.** Move the handler bodies out of `app.ts` into runtime service
   modules; `app.ts` keeps Fastify glue only (schema, reply codes, SSE hijack). Add
   `runtime/router.ts`: a dependency-free dispatcher `(method, path, body) => {status,
   contentType, body}` covering every route Axis calls (including `/local/*`, `/store/*`,
   `/cloud/*`, capability-gated 501s, and the deprecated `/am4/*` aliases can be skipped — Axis
   only uses them against v1 servers, which a browser runtime never is).
5. **Events.** The registry's subscribe/emit bus is already transport-agnostic; the browser
   runtime exposes `events.subscribe(fn)` directly (no SSE).
6. **Cloud + telemetry.** `cloud.ts` gets the store backend injected; `zlib` brotli calls go
   behind a `compress` adapter (Node: zlib; browser: brotli-wasm). `remote.ts` stays
   server-only (a browser tab is not a relay host).
7. **Packaging.** ForgeFX `server/package.json` gains a subpath export (e.g.
   `forgefx-server/runtime`) that Axis's Vite build can consume; the Electron and Docker entry
   points are untouched.

## Phase 3 — Axis: Browser Direct mode

1. **Mode plumbing.** The web build (`VITE_AXIS_REMOTE=1`) becomes the "web build" with a
   runtime mode choice: `?mode=direct` boots Browser Direct, `?mode=remote` (or no param, for
   backward compatibility with existing links/PWA installs) boots the remote gate. A small
   chooser is shown when neither applies. Desktop/Electron is untouched.
2. **`direct.svelte.ts`** (sibling of `remote.svelte.ts`): capability check → user gesture →
   `requestMIDIAccess({sysex: true})` or `navigator.serial.requestPort()` (Fractal VID `0x2466`
   filter) → construct the in-page runtime (registry + adapters) → `setRemoteTransport(router)`
   → runtime events → `editor.applyDeviceEvent()`. Clear error states: browser unsupported /
   permission denied / no port chosen / SysEx blocked / port busy / device unknown.
3. **Transports.** `WebMidiTransport` and `WebSerialTransport` implement ForgeFX's `Transport`
   interface exactly (send / sendQueued / sendPaced / request with timeout + quiet-window +
   match predicate; F0..F7 reassembly for serial; paced 64 B / 3 ms writes for FM3 CDC).
4. **Mode tri-state.** `isRemote()` currently gates local-folder and SSE features off. Split
   into `isRemote()` / `isDirect()`: Direct mode keeps local-folder UI **on** (served by the
   in-page runtime via File System Access) when `showDirectoryPicker` exists, shows the
   import/export fallback otherwise. The folder picker button uses the web picker instead of the
   Electron IPC one.
5. **Storage.** Direct mode's runtime store lives in IndexedDB (config docs, preset versions,
   history already is IDB). Full-device backups work — versions land in the browser store, cloud
   sync pushes them under the same free-tier quota rules.
6. **PWA/headers.** `Permissions-Policy: midi=(self), serial=(self)` added in axis-website
   `_headers`.

## Phase 4 — axis-website

- `/welcome` gains two prominent buttons: **Launch Axis in web** → `/?mode=direct` and
  **Launch Axis Remote** → `/?mode=remote`, with one-line explanations (direct = device plugged
  into *this* machine; remote = control the Axis desktop app on another machine) and a browser
  support hint for direct.
- `_headers`: add the Permissions-Policy line; keep existing security headers.
- Everything else in `public/` stays generated-only (deploy-remote.yml).

## Compatibility guarantees

- ForgeFX HTTP endpoints: unchanged (existing `test/api/*` suites are the contract).
- Axis Cloud Remote envelope: unchanged.
- Browser Direct reuses `Axis/src/lib/types.ts` DTOs and the existing `DeviceEvent` union.
- Desktop, Docker/Pi, and Cloud Remote deployments: untouched.

## Test plan

- **forgefx-midi:** existing codec tests + a bundler probe (Vite build importing codec subpaths;
  fail on any `node:*` in the graph).
- **ForgeFX:** existing route tests unchanged (byte-compat proof); new runtime-router tests
  asserting router responses === Fastify responses for the Axis endpoint inventory; store-backend
  contract tests run against both fs and an in-memory IDB shim.
- **Axis:** transport unit tests with mocked Web MIDI/Serial (frame reassembly, quiet-window,
  timeout, paced writes, permission rejection); build probe that the direct-mode bundle contains
  no Node core imports; `npm run check`.
- **Hardware acceptance:** FM3 over Web Serial (detect → grid → params → write → undo);
  FM9/Axe-Fx III over Web MIDI where hardware is available; AM4 over Web MIDI; Firefox +
  Android smoke test with a MIDI-class device; local folder round-trip in Chrome desktop.

## Assumptions

- ForgeFX Server is not deprecated; Browser Direct is additive.
- Chrome/Edge desktop is the primary target; Firefox/Android are supported with the documented
  MIDI-only device set; iOS/Safari is out of scope without a native bridge.
- Android/iOS store wrappers are out of scope.
