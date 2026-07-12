---
description: Ship a feature spanning forgefx-midi, ForgeFX, and Axis in strict layer order with per-repo Plane items and verification gates
---

Ship this cross-repo feature: $ARGUMENTS

This command EXECUTES work in the main session. Because cross-repo changes are
inherently large: after step 1, STOP and present the per-layer plan for approval
before editing any repo.

## Step 1 — Decompose into per-layer deliverables

- forgefx-midi: the protocol fact (encoding, opcode, enum, address model).
- ForgeFX: the endpoint + its DeviceCaps advertisement.
- Axis: types mirror, client method, store wiring, UI.

If any layer has nothing to do, say so explicitly and fall back to the narrower
command (`/new-endpoint` or `/implement-feature`).

## Step 2 — Task tracking (MANDATORY)

Tracker: Plane — see root `CLAUDE.md`, Task tracking section. Sibling repo Plane
projects: see each repo's local `CLAUDE.md`.

1. Create ONE work item PER affected repo project, titled consistently, each with
   its own layer's acceptance criteria.
2. Link the items as related where the tracker supports it.
3. Set the current layer's item In Progress as you reach that layer.

## Step 3 — Implement in strict order with verification gates

### 3a. forgefx-midi (protocol layer)

- Implement the protocol fact and its golden tests in that repo.
- Gate: `npm run build && npm test` THERE — build-first is mandatory.
- Protocol facts are verified upstream, never authored in Axis.

### 3b. ForgeFX (server layer)

- Rebuild/pick up the sibling codec package.
- Add the endpoint and the DeviceCaps capability advertisement.
- Gate: `cd server && npm run typecheck && npm test`.
- RESTART the ForgeFX dev server on :5056 so the new endpoint is live.

### 3c. Axis (UI layer)

- Follow `/new-endpoint` order: `src/lib/types.ts` → `src/lib/forgefx.ts` →
  `src/lib/editor.svelte.ts` wiring → UI (surface rules in `src/lib/CLAUDE.md`).
- Gate: `npm run check && npm test`.
- Browser refresh on :5173 and verify the flow end-to-end against the device/server.

Note: the `file:../ForgeFX/server` link only matters for the packaged desktop
build (reinstall/rebuild; no hot-reload). In dev, the :5173 server proxies to the
running ForgeFX process on :5056.

## Step 4 — Close out each layer

- As each layer lands: completion comment on that repo's Plane item (what changed,
  files, verification status), then set it Done.
- Per-repo commits follow each repo's own conventions — see each repo's local
  `CLAUDE.md`. Commit only when the user asks.
- On the Axis layout-rework branch: entry in
  `docs/axis_layout_rework_progress_log.md`.
