# Releasing the Axis stack

This is the **canonical, end-to-end release doc for the whole stack**. The four products release
as a chain, bottom-up — a protocol fact lands at the bottom (forgefx-midi) and ripples up to the
app (Axis) and the website. Each per-repo `docs/RELEASING.md` covers its own stage; this one is
the map.

Since the **zero-touch rework**, a normal release needs **exactly one human action: merge the
feature PR**. Everything after that — tags, releases, pin bumps, publishing, and the website
deploy — is automated. There is no more `release-prep` workflow, no manual `npm version`, no
manual tags, and no manual draft-publishing in the normal case.

```
  forgefx-midi ──(codec-released)──▶ ForgeFX ──(server-released)──▶ Axis ──(release published)──▶ axisapp.live
   protocol codec        device server            desktop + mobile app          website (Cloudflare)
   merge PR →            auto pin-PR (auto-merge) auto pin-PR (auto-merge)     deploys the released
   release-on-main tags  → release-on-main tags   → release-on-main tags        stack at its tag
   → auto release        → validated auto-publish → validated auto-publish      (use-lock 'true')
```

**Key principle:** CI everywhere integrates against **default-branch HEAD** of the siblings
(latest-against-latest is the signal we want). Only **tag-triggered release builds and the site
deploy pin** the exact sibling refs, via each repo's `stack.lock.json`.

**Versions come from tags, not from files.** `version-guard` is gone. The next version is computed
at release time from the last tag plus the merged PR's `release:*` label, and injected into
`package.json` *inside* the release build (before vite reads `__APP_VERSION__` and electron-builder
packages). Feature PRs never touch the version. **`CHANGELOG.md` is frozen** — it stays in the repo
as history, but nothing reads or writes it any more; the **GitHub releases page is canonical** (notes
are auto-generated from merged PRs + `.github/release.yml` label categories).

---

## The normal flow (what happens after you merge)

1. **Merge a feature/fix PR** to the default branch (required checks must be green — auto-merge is
   available). Optionally set exactly one `release:*` label (default is `patch`).
2. **`release-on-main`** runs when CI passes on the default branch: it reads the merged PR's label,
   computes the next version from the last tag, and pushes `vX.Y.Z(-beta)` with the PAT. (A tag
   pushed with the built-in `GITHUB_TOKEN` would not trigger the release build — hence the PAT.)
3. **`release.yml`** (tag-triggered) gates against the pinned stack, injects the version, builds,
   uploads a `release-manifest.json` asset, and — for ForgeFX/Axis — creates a **draft**, then a
   **validate-and-publish** job checks artifact completeness and **auto-publishes**.
4. Publishing fires the **ripple dispatch** to the next repo, whose **pin auto-PR** (stable branch,
   `bot/stack-sync` + `release:patch` labels) **auto-merges** on green checks → that repo's
   `release-on-main` runs → and so on up the chain.
5. **Publishing the Axis release** triggers **`deploy-remote`**, which builds the web SPA **at the
   release tag** with `use-lock 'true'` and pushes it to `sKuhLight/axis-website` → Cloudflare
   deploys → **axisapp.live serves the released stack**.

Any red gate stops **that stage only**; everything already released stays consistent. The
notification is a `release-failure` issue keyed by the correlation id `chainId = <repo>@<tag>`.

---

## Release labels

Set at most **one** bump `release:*` label on a PR. `release:hold` / `release:none` always win over
a co-present bump label (the documented opt-out); `pr-labels.yml` fails the check only when more
than one *bump* label (`release:patch` / `release:minor` / `release:major`) is present, and it is
*not* a required check. No label → **default patch**, except a **docs/CI-only** PR (only `docs/`,
`.github/`, or `*.md` changed) → **no release**.

| label | effect |
|---|---|
| `release:patch` | patch bump (this is also the default) |
| `release:minor` | minor bump |
| `release:major` | major bump |
| `release:none` | merge without cutting a release (changes ride the next one) |
| `release:hold` | merge, but `release-on-main` does not tag (temporary hold) |
| `bot/stack-sync` | marks the automated pin PRs (excluded from generated notes) |

Pin auto-PRs (`stack-bump.yml`) are labeled `bot/stack-sync` + `release:patch` by default, so
**adopting a pin cuts a release by default**. Relabel a pin PR `release:none` to adopt without a
release (infra-only changes ride the next release).

---

## The codec ≤ server invariant

Axis must **never** pin a `forgefx-midi` newer than the one ForgeFX shipped against. The two pins
move together, sourced from ForgeFX's own `stack.lock.json` via the `server-released` payload's
`codec_ref`: on a dispatch with an **empty** `codec_ref`, the codec pin is **left unchanged**. This
logic lives verbatim in `stack-bump.yml`; do not "simplify" it.

---

## Recovery / manual paths

Every automated hop keeps a `workflow_dispatch` escape hatch:

| workflow | manual dispatch | use |
|---|---|---|
| `release-on-main.yml` | `version` (exact, no `v`; empty = auto), `dry_run` | force a specific version, or dry-run the computation without creating anything |
| `stack-bump.yml` | `forgefx-ref`, `midi-ref` (empty = resolve default HEAD) | re-open/refresh the pin PR by hand |
| `release.yml` | re-run the tag build | **only while the release is still a DRAFT:** re-run a failed matrix leg → `validate-and-publish` re-runs; asset re-uploads are idempotent. Never re-run a published release's workflow — cut the next version instead |
| `deploy-remote.yml` | `ref` (a release tag; empty = latest published) | **roll the website back** to an earlier release, or re-deploy the current one |

The old manual path — `npm version` + `git tag vX.Y.Z && git push --tags` — still works as a last
resort (it triggers `release.yml` exactly as before).

## Emergency stop

Set the repo **Actions variable** `RELEASE_AUTOMATION_ENABLED=false` to halt automation:
`release-on-main` does not tag, pin PR auto-merge is skipped, and `validate-and-publish` leaves the
release a **draft** (each gate prints a notice and passes green). Unset (or any value other than
`false`) = automation on. Per-PR, the `release:hold` label has the same effect for that PR.

Tags and published artifacts are never mutated. Rollback = publish the next fixed version, re-point
a Docker `:latest` (documented digest re-tag in ForgeFX), or redeploy a previous website `ref`. For
electron-updater, superseded published releases stay; roll the feed with
`gh release edit <prev> --latest` and only delete a bad release if it was never published.

---

## Per-stage summaries

### Stage 1 — forgefx-midi (protocol codec)
Merge to `master` → `release-on-main` tags `vX.Y.Z` (no `-beta`) → `release.yml` gates, `npm pack`s,
publishes the release + manifest, and dispatches `codec-released` to ForgeFX.

### Stage 2 — ForgeFX (device server)
`codec-bump.yml` opens/auto-merges the `bump/forgefx-midi` pin PR → `release-on-main` tags
`vX.Y.Z-beta` → `release.yml` gates against the pinned codec, builds the GHCR image (`:tag` only),
drafts the release, and `validate-and-publish` asserts the multi-arch image manifest, publishes,
and moves `:latest`. Publishing dispatches `server-released` (with `codec_ref`) to Axis.

### Stage 3 — Axis (desktop + mobile app)
`stack-bump.yml` opens/auto-merges the `bump/stack` pin PR (BOTH pins, invariant enforced) →
`release-on-main` tags `vX.Y.Z-beta` → `release.yml` runs:
- **gate** — full check + unit test against the pinned sibling stack.
- **draft** — creates the release ONCE as a **draft**; notes = a "Shipped stack" footer (exact
  ForgeFX + forgefx-midi SHAs the gate built + the Axis tag) with GitHub's auto-generated
  "What's Changed" appended (`generate_release_notes: true`); uploads `release-manifest.json`.
- **desktop** — Win/macOS/Linux matrix; each uploads its installers to the draft (files only).
- **validate-and-publish** — asserts the full installer inventory (`latest*.yml` ×3; AppImage/deb/
  pacman/rpm; dmg ×2 + blockmaps; mac zip ×2; exe + blockmap; win zip) then `gh release edit
  --draft=false` (this arms electron-updater). Incomplete matrix or missing assets → stays a
  draft + a `release-failure` issue.

Secrets/vars (Axis repo → Settings → Secrets and variables → Actions):

| name | kind | used by |
|---|---|---|
| `STACK_DISPATCH_TOKEN` | secret | `release-on-main` tag push; pin-PR CI + auto-merge |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | secret | desktop + mobile builds (bundled server `.env`) |
| `AXIS_FARO_URL` | secret | desktop build (telemetry `.env`) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | variable | `deploy-remote` web build |
| `AXIS_WEBSITE_TOKEN` | secret | `deploy-remote` (push SPA to `sKuhLight/axis-website`) |
| `RELEASE_AUTOMATION_ENABLED` | variable | emergency stop (`false` halts automation; unset = on) |

### Stage 4 — axisapp.live (website)
`deploy-remote.yml` fires on **Axis release published** (or `workflow_dispatch` with a `ref`), builds
the remote web SPA **at the release tag** with `use-lock 'true'`, and pushes it into
`sKuhLight/axis-website/public`, which Cloudflare auto-deploys. The site therefore serves the **last
published release stack**, not default-branch HEAD. (The old push-paths and `stack-updated` triggers
are gone.)

## Mobile (OTA + IPA)
- `mobile-ota.yml` — tag `ota-ios-v*` → OTA web-bundle update (version from `package.json` + run
  number). Uses the pinned lock. Keep `MIN_NATIVE` <= the IPA's `MARKETING_VERSION`.
- `ios-unsigned.yml` — tag `ios-v*` → unsigned IPA artifact (re-sign at install time). Uses the
  pinned lock.

---

## The shared build-stack action

All Axis workflows check out Axis into `path: Axis`, then call
`uses: ./Axis/.github/actions/build-stack` — the single implementation of "check out the ForgeFX +
forgefx-midi siblings, set up Node, build codec (+ server)". `use-lock 'true'` pins from
`stack.lock.json` (release + site builds); `use-lock 'false'` tracks default-branch HEAD (CI). It
outputs the resolved refs and the actual checked-out SHAs for release stamping.

---

## Correlation id + failure notifications

Each release stamps a `chainId` (`<repo>@<tag>`, e.g. `Axis@v0.9.24-beta`) into its
`release-manifest.json` and dispatch payloads; pin PRs carry a `Chain:` line. Any automated stage
that fails creates or updates a single `release-failure` issue titled with the chainId — that issue
(→ mail / mobile push) is the notification. Success is visible in each run's step summary and on the
releases page.
