---
description: Plan a feature or change for Axis without editing anything — produces a layer-aware, test-aware plan and waits for approval.
---

Plan the following work WITHOUT editing any files. Investigate as needed (read
files, search the repo), then present a plan and stop for approval.

Feature / change to plan: $ARGUMENTS

Produce a plan with these sections:

1. Goal and acceptance criteria. One-line goal; concrete, checkable criteria for
   "done".

2. Layer placement. Axis is the UI layer of a three-layer stack. Decide where the
   work belongs:
   - Rendering / interaction / UX → here, in Axis.
   - Device interaction or a new HTTP operation → add or extend a ForgeFX endpoint
     first, then consume it via the ForgeFX client (`src/lib/forgefx.ts`).
   - Protocol facts (frames, opcodes, enums, address models) → forgefx-midi
     (downstream codec), not Axis.
   If the work needs downstream changes, say so explicitly and treat them as
   prerequisites.

3. UI surface. Is this monolith UI, workbench framework, or both?
   - Monolith: the legacy UI shown by plain `npm run dev`.
   - Workbench framework (under `src/lib/axis-workbench/`): use the scaffolding
     commands `/new-widget`, `/new-panel`, `/new-runtime-adapter` and follow the
     nested `src/lib/axis-workbench/CLAUDE.md` conventions.
   - Both: the monolith↔workbench mirror rule applies — preset-browser logic in
     `src/lib/PresetBrowser.svelte` / `src/lib/library.svelte.ts` must be mirrored
     into `src/lib/axis-workbench/presetBrowser/`.

4. Affected files. List the files you expect to add or change, with a one-line
   reason each. Respect the production-feature-keep rule: existing features must
   not be removed or gated off.

5. Feature-gate implications. Does this touch workbench code gated behind
   `VITE_AXIS_WORKBENCH === '1'`? State whether the feature needs the gate, and how
   it behaves with the gate off (plain `npm run dev` shows the monolith).

6. Test plan. Pure-module logic → a vitest test (node env, no DOM). Visible
   behavior → a Playwright e2e case (viewport ≥1366px). Note that CI runs neither
   suite, so tests must be run locally.

7. Task tracking. Search the task tracker for an existing work item first; create
   one if missing (imperative title; description = goal + why + acceptance
   criteria); set it In Progress when work starts. See the root CLAUDE.md,
   Task tracking section, for the tracker and policy.

8. Progress log. If work will happen on the layout-rework branch, add a step entry
   to `docs/axis_layout_rework_progress_log.md`.

End by presenting the plan and waiting for approval. Make no edits.
