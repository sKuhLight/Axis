#!/usr/bin/env bash
# Launches the full local dev chain: forgefx-midi (build once) -> ForgeFX server (:5056) -> Axis (:5173).
# Mirrors the manual sequence in README.md's "Run (dev)" section, plus the one-time builds that
# section doesn't mention: forgefx-midi and forgefx-server both ship dist/ exports that Vite/tsx
# resolve at import time, so a fresh sibling checkout needs a build before `npm run dev` will work.
set -euo pipefail

AXIS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORGEFX_DIR="$AXIS_DIR/../ForgeFX/server"
MIDI_DIR="$AXIS_DIR/../forgefx-midi"

for d in "$FORGEFX_DIR" "$MIDI_DIR"; do
  if [ ! -d "$d" ]; then
    echo "error: missing sibling repo at $d" >&2
    echo "  expected layout: code/{Axis,ForgeFX,forgefx-midi}" >&2
    exit 1
  fi
done

if [ ! -d "$MIDI_DIR/dist" ]; then
  echo "==> forgefx-midi/dist missing — building once"
  (cd "$MIDI_DIR" && npm install && npm run build)
fi

if [ ! -d "$FORGEFX_DIR/dist" ]; then
  echo "==> ForgeFX/server/dist missing — building once (Axis's dev bundle resolves forgefx-server/runtime from here)"
  (cd "$FORGEFX_DIR" && npm install && npm run build)
fi

echo "==> starting ForgeFX server (:5056)"
(cd "$FORGEFX_DIR" && npm run dev) &
FORGEFX_PID=$!

cleanup() {
  echo "==> stopping ForgeFX server"
  kill "$FORGEFX_PID" 2>/dev/null || true
  wait "$FORGEFX_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> starting Axis (:5173)"
(cd "$AXIS_DIR" && npm run dev)
