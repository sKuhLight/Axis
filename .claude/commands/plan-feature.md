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
     first, then consume it via the ForgeFX client (`src/lib/api/forgefx.ts`).
   - Protocol facts (frames, opcodes, enums, address models) → forgefx-midi
     (downstream codec), not Axis.
   If the work needs downstream changes, say so explicitly and treat them as
   prerequisites.

3. UI surface. Axis has one shell (the workbench). Workbench framework code lives
   under `src/lib/axis-workbench/`; use the scaffolding commands `/new-widget`,
   `/new-panel`, `/new-runtime-adapter` and follow the nested
   `src/lib/axis-workbench/CLAUDE.md` conventions.

4. Affected files. List the files you expect to add or change, with a one-line
   reason each. Respect the production-feature-keep rule: existing features must
   not be removed or gated off.

5. Feature-gate implications. The only remaining build gate is
   `VITE_AXIS_LAYOUT_EDIT === '1'` (workbench layout editing, off by default). State
   whether this feature touches it.

6. Test plan. Pure-module logic → a vitest test (node env, no DOM). Visible
   behavior → a Playwright e2e case (viewport ≥1366px). Note that CI runs neither
   suite, so tests must be run locally.

7. Task tracking. Search the task tracker for an existing work item first; create
   one if missing (imperative title; description = goal + why + acceptance
   criteria); set it In Progress when work starts. See the root CLAUDE.md,
   Task tracking section, for the tracker and policy.

End by presenting the plan and waiting for approval. Make no edits.
