# ADR-0001: Claude Code setup for Axis

- **Status:** Accepted
- **Date:** 2026-07-07
- **Owners:** maintainer

## Context

Axis is in the middle of a large, in-flight layout rework that introduces a new
workbench framework alongside the existing monolith UI. That transition creates
several standing hazards that automated coding agents can easily trip over:

- **Feature-gated dual UI.** The workbench is gated behind
  `VITE_AXIS_WORKBENCH === '1'`; plain `npm run dev` still serves the legacy
  monolith. Changes can land in one surface and silently miss the other.
- **Node-env-only unit tests, invisible to CI.** Unit tests run under vitest in a
  node environment with no DOM, so only pure `.ts` modules are tested and
  `.svelte` components are never mounted. CI runs typecheck and build only — no
  unit or e2e tests — so a broken test surface does not fail the pipeline.
- **A framework/binding layer split.** The workbench separates a reusable
  framework layer from Axis-specific bindings, a seam that must be respected as
  the framework matures toward extraction.
- **A monolith↔workbench mirror rule.** Preset-browser logic fixes in the
  monolith (`src/lib/PresetBrowser.svelte`, `src/lib/library.svelte.ts`) must be
  mirrored into `src/lib/axis-workbench/presetBrowser/`.

Axis is also part of a family of repositories that share a central task tracker,
and consistent guardrails across that family are wanted.

## Decision

Adopt the family-wide Claude Code baseline for this repository:

- A `settings.json` with conservative permissions.
- A guard hook.
- The `reviewer` and `test-runner` agents.
- The `/plan-feature` command.
- An ADR log under `docs/decisions/` (this file being its first entry).

Layered on top of the baseline, adopt workbench-specific expansion tooling scoped
to the framework that the rework introduces:

- A nested `CLAUDE.md` at `src/lib/axis-workbench/`.
- The `/new-widget`, `/new-panel`, and `/new-runtime-adapter` scaffolding
  commands.
- A `workbench-reviewer` agent for framework-specific checks.

This expansion tooling is deliberately designed to travel with the framework: when
the workbench is eventually extracted into its own repository, its `CLAUDE.md`,
scaffolding commands, and reviewer move with it.

Task tracking through Plane is mandatory. Tracker identifiers and project details
live only in the local-only root CLAUDE.md; committed files refer to it generically
(see the root CLAUDE.md, Task tracking section).

## Alternatives

- **No tooling.** Rely on reviewer discipline alone. Rejected: the hazards above
  are exactly the kind an agent misses, and the cost of a missed mirror or an
  untested change is high.
- **README-only conventions.** Document the rules in prose without agents,
  commands, or hooks. Rejected: prose is not enforced and is easy to skip.
- **Wait until after the framework extraction.** Rejected: the expansion tooling
  is most valuable NOW, during the rework, when the framework is being actively
  shaped and the mirror and feature-gate rules are in daily play.

## Consequences

- Guardrails are enforced through agents and a hook rather than relying on memory.
- Scaffolding recipes for the workbench are encoded, so new widgets, panels, and
  runtime adapters follow the conventions by default.
- The seams that will matter at extraction time are documented, and the expansion
  tooling is built to move with the framework.
- Local-only files (the root CLAUDE.md and its tracker identifiers) are not
  committed and must be recreated on each fresh clone from the private family
  setup guide.
