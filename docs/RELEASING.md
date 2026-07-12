# Releasing the Axis stack

This is the **canonical, end-to-end release doc for the whole stack**. The four products
release as a chain, in a fixed order — a protocol fact lands at the bottom (forgefx-midi) and
ripples up to the app (Axis) and the website. Each per-repo `docs/RELEASING.md` covers its own
stage; this one is the map.

```
  forgefx-midi ──(codec-released dispatch)──▶ ForgeFX ──(stack-updated dispatch)──▶ Axis ──▶ axisapp.live
   protocol codec         device server            desktop + mobile app          website (Cloudflare)
   tag v* → auto-release  tag v*-beta → draft       tag v*-beta → draft           auto-deploys from
   + notify ForgeFX CI    release + notify Axis      release → manual publish      Axis main + ForgeFX
                                                                                    stack-updated
```

**Key principle:** CI everywhere integrates against **default-branch HEAD** of the siblings
(latest-against-latest is the signal we want). Only **tag-triggered release builds pin** the exact
sibling refs, via each repo's `stack.lock.json`. Bumping those pins is part of the release checklist.

---

## Cross-cutting conventions

- **Node 22** everywhere; `actions/checkout@v4` + `actions/setup-node@v4`.
- **`STACK_DISPATCH_TOKEN`** — a PAT with `repo` scope on the *target* repo, used by the
  cross-repo `repository_dispatch` notify steps. Every dispatch step is **soft-gated**: if the
  secret is empty it prints a "not configured — skipping" notice and succeeds.
- **`repository_dispatch` event types:**
  - `codec-released` — forgefx-midi release → `sKuhLight/ForgeFX` (re-runs ForgeFX CI against the
    new codec release).
  - `stack-updated` — ForgeFX green push to `main` → `sKuhLight/Axis` (re-deploys axisapp.live,
    because the Browser Direct runtime bundles forgefx-server).
- **`stack.lock.json`** (ForgeFX + Axis repo roots) pins sibling git refs for **release builds
  only**. Resolution: read with `jq`; a missing file/key or empty ref → fall back to `''`
  (= default branch HEAD) with a warning to the log + `$GITHUB_STEP_SUMMARY`.

---

## Stage 1 — forgefx-midi (protocol codec)

1. Merge the protocol change to `master` (CI green).
2. Bump the package version; tag `vX.Y.Z`; push the tag.
3. `release.yml` gates (`npm run build && npm test` — build FIRST, the smoke test reads `dist/`),
   `npm pack`s the tarball, publishes a GitHub release, and fires `codec-released` at ForgeFX.
4. Downstream repos pin this new ref in their `stack.lock.json` (next stage).

Secret: `STACK_DISPATCH_TOKEN` (notify ForgeFX).

## Stage 2 — ForgeFX (device server)

1. Codec released & the ref you want is known.
2. Bump `stack.lock.json` → `forgefx-midi.ref` to the released codec SHA.
3. Bump the server version (`cd server && npm version …`).
4. Tag `vX.Y.Z-beta`; push the tag.
5. `release.yml`: **gate** (full codec+server test against the pinned codec) → **docker**
   (GHCR image, same pinned ref) → **draft** release stamping the shipped codec ref + server
   version. Review, then publish.

Secrets: `STACK_DISPATCH_TOKEN` (notify Axis on main pushes); GHCR uses the built-in `GITHUB_TOKEN`.

## Stage 3 — Axis (desktop + mobile app)

1. Codec + server released & pinned.
2. Bump `stack.lock.json` → both `forgefx-midi.ref` and `ForgeFX.ref`.
3. Bump the Axis version (`npm version vX.Y.Z-beta --no-git-tag-version`).
4. Add a CHANGELOG section. **Header format: `## <version> — <date>`** (e.g.
   `## 0.8.8-beta — 2026-07-11`) — the release workflow `awk`-extracts the body between this
   header and the next `## ` header.
5. Tag `vX.Y.Z-beta`; push the tag.
6. `release.yml` runs three jobs:
   - **gate** — full check + unit test against the pinned sibling stack.
   - **draft** — creates the release ONCE as a **draft**, notes = CHANGELOG section + a
     "Shipped stack" footer (the exact ForgeFX + forgefx-midi SHAs the gate built + the Axis tag).
   - **desktop** — Win/macOS/Linux matrix; each uploads its installers to the draft (files only).
7. **Smoke-test an installer, then PUBLISH the draft manually.** Publishing is what arms
   electron-updater — the `latest*.yml` auto-update feed stays dark until you publish.

Secrets/vars (Axis repo → Settings → Secrets and variables → Actions):

| name | kind | used by |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | secret | desktop + mobile builds (bundled server `.env`) |
| `AXIS_FARO_URL` | secret | desktop build (telemetry `.env`) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | variable | `deploy-remote` web build |
| `AXIS_WEBSITE_TOKEN` | secret | `deploy-remote` (push SPA to `sKuhLight/axis-website`) |

## Stage 4 — axisapp.live (website)

No manual release. `deploy-remote.yml` builds the remote web SPA and pushes it into
`sKuhLight/axis-website/public`, which Cloudflare auto-deploys. It fires on:
- pushes to Axis `main` touching UI/build inputs, **and**
- a `stack-updated` dispatch from ForgeFX (server changes redeploy the bundled Browser Direct runtime).

The site tracks default-branch HEAD by design (`use-lock 'false'`) — it always reflects the latest.

## Mobile (OTA + IPA)

- `mobile-ota.yml` — tag `ota-ios-v*` → OTA web-bundle update (version derived from
  `package.json` + run number). Uses the pinned lock (`use-lock 'true'`). Keep `MIN_NATIVE` <= the
  IPA's `MARKETING_VERSION`.
- `ios-unsigned.yml` — tag `ios-v*` → unsigned IPA artifact (re-sign at install time). Uses the
  pinned lock.

---

## The shared build-stack action

All five Axis workflows check out Axis into `path: Axis`, then call
`uses: ./Axis/.github/actions/build-stack` — the single implementation of "check out the ForgeFX
+ forgefx-midi siblings, set up Node, build codec (+ server)". `use-lock 'true'` pins from
`stack.lock.json` (release builds); `use-lock 'false'` tracks default-branch HEAD (CI + site).
It outputs the resolved refs and the actual checked-out SHAs for release stamping.

---

## Automation

The ripple between stages is automated; humans review PRs and decide what becomes a release.

- **version-guard** (`ci.yml`, every repo) rejects any non-docs PR that doesn't bump its
  package version above the base branch (docs-only PRs pass). Compare rule: numeric
  `major.minor.patch`, and on an equal triple a prerelease (`-beta`) ranks below its release;
  head must be strictly greater. Fix: `npm version X.Y.Z --no-git-tag-version` (bumps the
  lockfile too).
- **`codec-released` → ForgeFX `codec-bump.yml`** — a forgefx-midi release opens a PR in
  ForgeFX bumping `stack.lock.json → forgefx-midi.ref`. Merge = adopt; whether ForgeFX also
  releases is a human call (wire/API/catalog change → release; internal-only → pin rides along).
- **`server-released` → Axis `stack-bump.yml`** — **publishing** a ForgeFX release (drafts
  don't count) opens a PR here bumping `ForgeFX.ref` to the released tag AND `forgefx-midi.ref`
  to the codec ref ForgeFX shipped against. **Invariant: the two pins move together — Axis
  never pins a codec newer than the one ForgeFX shipped.** Merge these PRs instead of
  hand-editing `stack.lock.json`.
- **`release-prep.yml`** (Axis, `workflow_dispatch`) is the **recommended way to start an Axis
  release**: enter a version → it bumps `package.json` + lock, seeds a `## <version> — <date>`
  CHANGELOG section from the commits since the last tag, and opens a `release/<version>` PR.
  Edit the CHANGELOG wording in the PR, confirm the `stack.lock.json` pins, merge, then tag
  `vX.Y.Z-beta` to build the draft release. Publish the draft after smoke-testing (publishing
  arms electron-updater).
- **Axis release decision rule:** cut a release when a server/codec change is **user-visible in
  the app**; infra-only changes just let the pins ride along the next release.

Auto-PR token: the ripple/prep workflows use `${{ secrets.STACK_DISPATCH_TOKEN || secrets.GITHUB_TOKEN }}`.
A PAT makes the auto-PR's own CI run; with the `GITHUB_TOKEN` fallback the PR is still created
but its CI must be triggered manually (close/reopen the PR).

CI everywhere still integrates against **default-branch HEAD**; only tag/mobile builds use the
pinned `stack.lock.json` refs.
