---
description: Consume a new ForgeFX endpoint in Axis — types mirror, client method, store wiring, capability gate, transport check
---

Consume this ForgeFX endpoint in Axis: $ARGUMENTS

This command EXECUTES work in the main session. The endpoint itself is built in
ForgeFX first — if it does not exist yet, STOP and use `/cross-repo-feature`.
If the change is large or ambiguous, stop after step 1 and get approval before editing.

## Step 1 — Task tracking (MANDATORY)

Tracker: Plane — see root `CLAUDE.md`, Task tracking section.

1. Search this repo's Plane project for an existing work item; create one if
   missing (imperative title; description = goal, why, acceptance criteria).
2. Set it In Progress before touching code.
3. Confirm the endpoint exists in ForgeFX and note its exact request/response shape.

## Step 2 — The 4-step add (in this order)

### 2a. Types — `src/lib/types.ts`

- Hand-mirror the request/response shape from the ForgeFX endpoint.
- Mind the hand-mirrored contract: drift typechecks green but fails at runtime —
  copy the shape exactly from the server source, not from memory.
- Make new v2 capability fields optional so legacy servers degrade gracefully.

### 2b. Client method — `src/lib/forgefx.ts`

- Add ONE method to the `forgefx` object using `req<T>`.
- Naming: reads = noun names; writes = verb-prefixed.
- Use the correct HTTP method and body.
- Override the 12s AbortSignal timeout for long-running operations.

### 2c. Store wiring — `src/lib/editor.svelte.ts`

- Add a store action/getter: optimistic update → `await forgefx.*` → revert on catch.
- Reuse existing debounce/reload plumbing (e.g. `#eventReload`) rather than
  introducing new timers.

### 2d. Capability gate (if device-dependent)

- Add a DeviceCaps field and a `get hasX()` getter; gate the UI on it.
- Never branch on model names.

## Step 3 — Transport check

- SSE events only run in local mode.
- Binary responses branch on `isDirect()`.
- Handle remote/direct modes explicitly, or document the limitation in the code
  and the Plane item.

## Step 4 — Tests

- Extract pure logic to a `.ts` module with a co-located vitest test (node env, no DOM).
- Add an e2e spec only for workbench-shell-visible behavior (mirror existing specs,
  viewport >= 1366px, `bootCleanWorkbench`).

## Step 5 — Verify

- `npm run check && npm test` — CI runs neither; local is the only gate.
- Dev note: restart the ForgeFX dev server on :5056 to pick up the new endpoint —
  the Axis dev server only proxies. Then exercise the feature on :5173.

## Step 6 — Close out

- On the layout-rework branch: entry in `docs/axis_layout_rework_progress_log.md`.
- Plane: completion comment (what changed, files touched, verification status),
  then set the item Done.
- Commit only when the user asks.
