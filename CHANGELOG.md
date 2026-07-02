# Changelog

Notable changes per release, for Axis and its bundled ForgeFX engine. Newest first.

## 0.6.5-beta — 2026-07-02

### Added
- **AM4 is now editable.** Opening a block on an AM4 loads its parameters (they were empty before);
  the preset **Library** lists the AM4's stored presets and loads them; **Save** writes to an AM4
  location. Previously the AM4 could only show its grid.

### Changed
- The bundled engine moved to a consolidated codec package (**forgefx-midi**) that adds a full
  per-device read/write layer. Existing FM3 / FM9 / Axe-Fx III behaviour is unchanged.

## 0.6.4-beta — 2026-07-02

### Fixed
- **AM4 responsiveness (follow-up).** The background preset-watch was still querying the gen-3
  preset-name function every few seconds on an AM4 — a request it can't answer, so each one timed
  out (~1.2 s of lag). It's now skipped on the AM4, which tracks its preset through its own read.

## 0.6.3-beta — 2026-07-02

### Fixed
- **AM4 no longer stalls.** Gen-3 telemetry polling (audio meters, tuner) was wrongly running
  against an AM4 and flooding its MIDI link with frames it never answers — making every action
  lag about a second. Those polls are now gated off for the AM4, which uses its own engine.

### Added
- **Installable app (PWA)** at **axisapp.live** — add it to your home screen for a standalone,
  full-screen control surface with free rotation (auto-rotate). Web only; the desktop app is unchanged.
- **Scene names** in the top bar, with **inline rename**.
- **Preset rename** — the ✎ next to the preset name, and **Rename & save** in the Library
  right-click menu (renames a stored preset in place and returns you to the preset you were on).

### Changed
- **Control surface fits the window.** Your column count is now a *preferred maximum*: an ultrawide
  monitor shows many columns, a narrow window or phone scales down to a legible few — instead of
  forcing one fixed count everywhere.
- **Real output metering.** The top-bar meter shows calibrated dB read from the device; the cable
  signal-flow animation is smoothed and follows the live output level (silent = still, louder = faster).

## 0.4.27-beta — 2026-07-01

### Added
- **Guided app tour.** A first-run walkthrough of the essentials (grid, preset browser,
  block editing, footswitches, connection, the Axis hub). Replayable any time from
  **Axis → About → Replay app tour**.
- **Connection & Device settings** (Axis hub → **Connection**). Auto-detect still runs,
  but you can now **override the device profile** (force FM3 / FM9 / Axe-Fx III / AM4) and
  **pick the transport + ports manually** (serial or MIDI, with independent MIDI In/Out).
  This makes it possible to use a device over a **MIDI→USB adapter** — e.g. an FM3 with a
  dead USB port, via its 5-pin MIDI — where auto-detect can't identify it.

### Changed
- **MIDI (5-pin) links are now usable.** Live-meter polling and background queries are
  throttled on a slow MIDI link so preset loads + edits actually complete (they were
  saturating the ~31 kbaud cable). Expect it to be slower than USB — MIDI is a fallback,
  USB is the fast path. A manual MIDI connection now also survives device reboots/replugs.

### Notes
- Reading/writing over a 5-pin MIDI adapter is verified working but slow (~9s for a preset
  load); a quality USB-MIDI interface behaves best. USB remains the recommended connection.

## 0.4.26-beta — 2026-07-01

### Changed
- **Sharper diagnostics (opt-in).** With diagnostics enabled, Axis now automatically
  reports server-side failures — device communication, cloud, and engine timeouts —
  with device context (model, firmware, endpoint, status), so bugs surface across the
  whole beta instead of only when someone files a report. Still no presets or personal
  data, and still off until you opt in.

## 0.4.25-beta — 2026-07-01

### Fixed
- **Cloud & diagnostics really work in packaged builds now.** The desktop app's bundled
  Node has no global WebSocket, which made the Supabase client throw on creation — so
  sign-in, sync, and diagnostics stayed disabled even though the configuration loaded.
  Fixed by shipping a WebSocket implementation with the engine.
- **Parameter descriptions restored.** Hovering a control shows its explanation
  (name — description · tip) in the bottom status bar again, not just its name/value.

## 0.4.24-beta — 2026-07-01

### Fixed
- **Cloud & diagnostics were disabled in packaged builds.** The bundled Supabase / cloud
  configuration wasn't being loaded in the packaged desktop app, so sign-in and sync
  reported "not enabled on this engine." The desktop shell now loads it before starting
  the engine — cloud sync and diagnostics work in all release builds.
- **Axe-Fx III: empty block-type lists.** Choosing a block's type (amp, drive, reverb,
  comp, delay…) showed an empty list on the Axe-Fx III. The type rosters now populate
  correctly (amp/drive/reverb/comp/delay/etc.).

## 0.4.23-beta — 2026-07-01

### Added
- **One "Axis" hub.** The Cloud and Privacy rail buttons are now a single **Axis**
  button opening a tabbed panel — **Account** (sign-in / register / sync / contact /
  delete), **Privacy** (diagnostics + debug report), and **About** (version, support,
  legal).
- **Free cloud tier — open for registration.** Create an account and sync your **Axis
  config** (tags, filters, favorites, layouts, footswitch & scene setups) across every
  device. Preset & full-device cloud backup are a **supporter-tier** feature; on the
  free tier your presets stay on your machine.
- **Privacy & Diagnostics.** **Opt-in** anonymous diagnostics (off by default; a
  first-run prompt lets you choose) that help fix bugs faster — no personal data, no
  presets. Plus an on-demand **"Send debug report"** with an optional contact field so
  we can follow up, and an automatic prompt after a device error.
- **Delete account & data.** Permanently erase your account and all cloud data (GDPR).
- **Support the project.** A Ko-fi link (About tab + status bar) — Axis is free &
  open-source; contributions are entirely optional.
- **Status bar.** A new bottom bar shows the parameter under your cursor on the left,
  and support / imprint links on the right.
- **Legal links.** Registration shows the Terms & Privacy agreement; the app links to
  the Privacy Policy / Terms / Imprint at axisapp.live.

### Notes
- Diagnostics and cloud sync remain **optional and off until you opt in**; the editor
  and local backups work fully offline with no account.

## 0.4.22-beta — 2026-06-30

### Fixed
- **Axe-Fx III / FM9: empty Signal Grid.** Their preset dumps arrive as ~3 KB
  SysEx chunks, but the MIDI receive buffer defaulted to 2 KB and silently
  truncated each chunk — so the preset body was incomplete and the grid/blocks
  couldn't be decoded (the editor showed device-connected but an empty grid).
  The buffer is now large enough for any gen-3 dump. (The FM3 was never affected
  — its chunks are smaller than 2 KB.)

### Changed
- Grid and block decode failures now record the underlying error in the debug
  log instead of a bare 503, so device-specific decode issues are faster to
  diagnose from a user's report.

## 0.4.21-beta — 2026-06-30

### Fixed
- **Signal Grid: connecting blocks across a gap.** Drawing a cable between two
  blocks with empty columns between them now places a routing shunt in *every*
  gap cell, not just the first — so the connection actually reaches the target.
  (Each shunt now gets a unique instance id, which the device requires.)
- **Foot Controller: custom switch labels now show.** Typing a custom label also
  switches that side to "Custom" display mode, so the text is actually displayed
  on the switch (previously the characters were stored but never shown).

### Added
- **Foot Controller: live read-back.** The FC editor now reads the current state
  from the connected unit — each switch's category, function, display mode,
  colour and custom label — so the controls reflect what is actually on the
  device instead of starting blank. The FC editor is now full read/write.

## 0.4.20-beta — 2026-06-30

### Fixed
- **Axe-Fx III: empty Signal Grid / "no 0x78 chunks found".** A preset dump is a
  multi-packet transfer (header → payload chunks → terminator). On some Windows
  USB-MIDI stacks the payload chunks were intermittently dropped on the large
  Axe-Fx III dump, so the grid couldn't be decoded and showed as offline/empty.
  The engine now re-reads an incomplete dump (up to 3×) until it arrives whole,
  across the grid, library-summary, params and backup read paths.

### Added
- **FM3 Foot Controller: "on unit" indicator.** The Foot Controller editor now
  reads the connected unit and badges the switches it reports as assigned, so you
  can see at a glance which switches are in use. (Reading back each switch's
  category / label / colour is not available yet — only assignment status.)

### Performance
- **Library opens instantly.** The Preset Browser no longer builds its full
  free-text search index when you open it. The index is built on demand for the
  first text search and quietly pre-warmed in the background while the app is
  idle, so opening the Library is immediate even with a full preset list.
