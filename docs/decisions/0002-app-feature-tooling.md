# ADR-0002: App-feature tooling for Axis

- **Status:** Accepted
- **Date:** 2026-07-07
- **Owners:** maintainer

## Context

This is an AXIS-level follow-up to ADR-0001. That first round covered the shared
guardrails (permissions, guard hook, reviewer/test-runner agents, `/plan-feature`)
and the workbench-framework scaffolding, but it left one large area unencoded:
**app-feature implementation** — work in the monolith UI, changes to the central
store, consuming new ForgeFX endpoints, and features that span the three-repo stack
(fractal-midi → ForgeFX → Axis). Those tasks had no encoded workflow.

The app layer carries strong *implicit* conventions that are easy to violate:

- A **singleton runes store** as the single source of truth (`editor.svelte.ts`),
  not per-component state.
- **Hand-mirrored API types** in `types.ts` that must track the ForgeFX API.
- **Capability gates** — features are guarded on device/connection capability
  rather than assumed available.
- **Optimistic writes** against an async `/api` that the store polls and reconciles.
- A **dual-shell UI** (legacy monolith vs. feature-gated workbench) where a change
  can land in one surface and silently miss the other.

Because CI runs no tests (typecheck and build only), convention errors are not
caught in the pipeline — they reach runtime.

## Decision

Add an **app-layer development guide** at `src/lib/CLAUDE.md` (committable) and three
executing commands:

- **`/implement-feature`** — a disciplined end-to-end loop: task tracking, the
  dual-shell surface decision, the conventions checklist, tests, and verification.
- **`/new-endpoint`** — the four-step `types → client → store → gate` recipe for
  consuming a new ForgeFX endpoint.
- **`/cross-repo-feature`** — the ordered `protocol → endpoint → UI` chain across the
  sibling repos, with per-repo task items and verification gates.

The step-by-step recipes live in `src/lib/CLAUDE.md`; this ADR references them rather
than restating them.

## Alternatives

- **Leave the conventions implicit.** Rejected: this produces recurring divergence —
  e.g. the documented monolith/workbench preset-browser mirror trap, where a fix in
  one surface is not carried to the other.
- **One mega-command covering every layer.** Rejected: layer-specific checklists are
  shorter and therefore more likely to actually be followed.

## Consequences

- Feature work follows one encoded path per layer, reducing drift.
- The guide must be kept honest as the app conventions evolve; a stale guide is worse
  than none.
- Local-only files are still recreated on each fresh clone from the private family
  setup guide.
