---
description: Implement an Axis app feature end-to-end — plan, Plane work item, layer check, conventions, tests, verify, close out
---

Implement this Axis feature: $ARGUMENTS

This command EXECUTES work in the main session (unlike `/plan-feature`, which is
plan-only). If the change is large or ambiguous, STOP after step 3 and get approval
before editing.

## Step 1 — Restate the goal

1. Restate the goal and acceptance criteria from the arguments above.
2. If the request is ambiguous (unclear scope, multiple plausible interpretations),
   ask before editing anything.

## Step 2 — Task tracking (MANDATORY)

Tracker: Plane — see root `CLAUDE.md`, Task tracking section.

1. Search this repo's Plane project for an existing work item covering this feature.
2. If missing, create one: imperative title; description = goal, why, acceptance criteria.
3. Set it In Progress before touching code.

## Step 3 — Layer placement (stop if wrong repo)

- New protocol facts (frames, opcodes, enums, address models) → belong in
  forgefx-midi. STOP and use `/cross-repo-feature`.
- New device interaction or HTTP endpoint → built in ForgeFX first. STOP and use
  `/cross-repo-feature`.
- Pure UI / behavior on existing endpoints → continue here.
- Workbench framework mechanics (new widget/panel/adapter) → use `/new-widget`,
  `/new-panel`, or `/new-runtime-adapter` instead.

## Step 4 — UI-surface decision (see src/lib/CLAUDE.md)

- Editor-flag modal → reaches both shells automatically.
- Feature inside an embedded editor (SignalGrid / BlockEditor / FcEditor /
  VirtualScreen / ModifierEditorCore) → both shells automatically.
- TopBar / ToolRail chrome → monolith only; plan the mirrored workbench
  widget/panel too.
- Preset-browser logic → MUST be mirrored into `src/lib/axis-workbench/presetBrowser/`.

## Step 5 — Implementation conventions checklist

- [ ] Svelte 5 runes only — never `writable()`.
- [ ] State lives in the editor singleton (`src/lib/editor.svelte.ts`) unless it has
      independent persistence or an import-cycle risk — then its own `*.svelte.ts`.
- [ ] Actions: optimistic update → `await forgefx.*` → revert on catch.
- [ ] Device-dependent behavior is capability-gated via a DeviceCaps getter
      (`get hasX()`) — never model-name checks.
- [ ] Any new persisted slice gets Zod validation.
- [ ] Never add unguarded reads to the poll loop.
- [ ] SSE/binary features handle all three TransportModes (local / remote / direct).

## Step 6 — Tests

- Extract pure logic to a `.ts` module with a co-located vitest test (node env,
  no DOM — `.svelte` files are never unit-mounted).
- Add an e2e spec only if the feature has workbench-shell-visible behavior:
  mirror existing specs in `e2e/`, viewport >= 1366px, use `bootCleanWorkbench`.

## Step 7 — Verify

- Run `npm run check && npm test`. CI runs neither — local is the only gate.
- Run the app and exercise the feature if feasible.

## Step 8 — Close out

- On the layout-rework branch: add an entry to
  `docs/axis_layout_rework_progress_log.md`.
- Plane: completion comment (what changed, files touched, verification status),
  then set the item Done.
- Commit only when the user asks.
