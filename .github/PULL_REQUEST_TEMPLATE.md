<!-- What & why: summarise the change and the reason for it. -->

## Release

Merging to `main` releases automatically — a single `release:*` label controls it:

- **no label** → patch (a PR touching only `docs/`, `.github/`, or `*.md` → no release)
- **`release:minor`** / **`release:major`** → bigger bump
- **`release:none`** → adopt without releasing (rides the next release)
- **`release:hold`** → merge now, release later
- `release:hold` / `release:none` win over a co-present bump label
- at most **one** bump label (the `pr-labels` check enforces this)

Versions come from tags — never bump `package.json` in a PR. This repo releases with the `-beta` suffix (`X.Y.Z-beta`).

Details: docs/RELEASING.md
