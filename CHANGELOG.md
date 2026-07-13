# Changelog

Notable changes per release, for Axis and its bundled ForgeFX engine. Newest first.

## 0.9.10-beta — 2026-07-13

### Changed

- Merge pull request #64 from sKuhLight/bump/stack-v0.6.13-beta
- stack: bump ForgeFX pin to v0.6.13-beta (+ matching forgefx-midi pin)

## 0.9.9-beta — 2026-07-13

The Definitions Update: after a firmware update, Axis can now get fresh, device-true effect
definitions (blocks, types, parameters, ranges) on its own — no app update needed. (Supersedes
the unreleased 0.9.8-beta, whose read-from-device path could freeze an FM3.)

### Added

- **Device-definitions prompt** — connecting a device whose firmware has no stored definition
  profile now offers, in order of speed: pulling a **shared community profile from the cloud**,
  importing the **official editor's cache file** (found automatically on your computer, or drag
  and drop an `effectDefinitions_*.cache` file), or **reading the definitions straight off the
  device** with a live progress bar. Dismissible per device+firmware.
- **Share to cloud** — after building or importing a profile, signed-in users can share it so the
  next person on that firmware skips the wait entirely.
- **Editor-folder access in the browser** (Chromium): point Axis at your editor's folder once and
  it silently picks up fresh definition caches after future firmware updates.
- **Definitions readout** — the Axis panel now shows where the active definitions come from
  (bundled, read from device, editor cache file, or shared cloud profile).

### Fixed

- **FM3 freeze during read-from-device.** The definitions walk asked the device to describe
  value lists for continuous (non-list) parameters — a request real units don't support, which
  could hard-freeze an FM3 seconds into a build. The walk now only queries genuine value lists,
  stays inside the hardware-validated parameter range, pauses briefly between blocks, and pairs
  every reply strictly with its own query.

### Changed

- Read-from-device is gentle on the hardware: the walk is paced, and Axis pauses its background
  polling while a build or import runs.
- Bundled ForgeFX engine **0.6.12-beta** (runtime on-connect definition builds, editor-cache
  import, cloud profile source) with protocol codec **0.3.18** (firmware-version read, live
  self-describe walk).

## 0.9.4-beta — 2026-07-13

The Telemetry Update: Axis now lets you choose how chatty it is with your device.

### Added

- **Polling mode** — new Performance section in the Axis panel with three modes:
  *Performance* (snappiest reflection), *Balanced* (new default) and *Reduced (Live)*
  (minimal background traffic for stage use). The choice syncs with your profile and
  applies across desktop, browser-direct and remote sessions.
- **Telemetry widget** — optional workbench widget showing the active polling mode
  (with quick-switch) and the live MIDI wire traffic (messages/s, KB/s) of the
  connected ForgeFX engine.

### Fixed

- **AM4 audio dropouts** — the bundled ForgeFX engine (0.6.8-beta) no longer
  re-reads all placed blocks every 1.5 s while a preset has unsaved edits; on the
  AM4 this caused audible dropouts about once a second, even on direct monitoring.
  Background polling now mirrors AM4-Edit's lightweight idle behavior; front-panel
  changes still reflect within a couple of seconds.
- **Stale block editor after channel switch** — on devices without scene-state
  support the open block's parameters (e.g. the Type selector) now refresh after a
  device-side channel change.
- **Small grids fill the pane** — AM4/VP4 grids now use the full editor pane in
  auto/full layout modes instead of huddling in a corner.

### Changed

- Background polling of the device server now scales with the selected polling
  mode; device meters keep their feel at every rate (tick-rate-aware smoothing).
- Bundled engine pins: ForgeFX v0.6.8-beta, forgefx-midi v0.3.15.

## 0.9.1-beta — 2026-07-13

Re-cut of 0.9.0-beta (The Layout Update — see below), whose macOS installers never built. Same app, fixed release pipeline.

### Fixed

- macOS installer build: the UI build ran out of memory on the smaller macOS runners (Node heap limit) — the release workflow now grants it a 4 GB heap



## 0.9.0-beta — 2026-07-12

The Layout Update — the workbench shell is now the default UI (legacy shell: start with VITE_AXIS_WORKBENCH=0).

### Added

- Pages navigation: every nav entry is its own freely configurable page (rename, delete, reorder, add); seed pages for Grid, Preset Browser, Scenes, Live, Setup, Controllers and Footswitches, per device profile; existing layouts migrate automatically
- Page-scoped layout store: save any page as a layout and apply it to other pages; import/export as packages; document backups
- Custom control panels: drag controls out of the Block Editor and collect params from different blocks in one panel — always live (no open block required), block-accent colored, source tooltip, touch-friendly tiles
- Editor-true Block Editor default boards: tabs, rows and widget types mirror the official editors per block type, including firmware-specific amp pages (FM3, FM9, Axe-Fx III, AM4)
- Grid routing: multi-column cable drag connects the whole path (auto-shunts, live preview); dropping a block onto a shunt replaces it and keeps its wiring; each gesture is one undo step
- Customize mode: searchable Pages/Widgets/Layouts browser with full drag & drop, touch-friendly widget/group menus, real tablet/mobile preview frames while editing

### Changed

- Workbench shell is the default; drag & drop unified onto one shared machinery (drawer, pages, widgets, controls); full-region drop highlights, tab-bar drops and spring-loaded tabs
- Stack pins: ForgeFX v0.6.7-beta + forgefx-midi v0.3.15 (editor-layout catalog v2)

### Fixed

- Dozens of drag & drop, persistence and rendering fixes across the rework rounds (drag ghosts, stale drop overlays, selection-dependent controls, duplicate page tabs)

## 0.8.7-beta — 2026-07-11

### Fixed
- **AM4 block channels (A/B/C/D) now reflect the unit.** Switching a block's channel — in Axis,
  on the front panel, or in AM4-Edit — is now shown correctly in Axis, along with that channel's own
  settings (e.g. a per-channel reverb type). Previously Axis stayed on channel A, and channel switches
  made on the unit didn't appear. *(Decoded from device captures; if a channel readback looks off on
  your AM4, please report it.)*

## 0.8.6-beta — 2026-07-10

Consolidates everything since 0.8.4-beta (the interim 0.8.5-beta build shipped without its own
notes, so its changes are folded in here).

### Added
- **Axe-Fx Standard / Ultra (gen-1) support.** The original Axe-Fx is now selectable as a device
  (read-only for now): Axis reads the preset name and the effect grid straight from the unit.
  *(Decoded from the published gen-1 spec; not yet confirmed on real hardware.)*
- **AM4 — per-block channel (A/B/C/D) switching.** You can now switch the channel of **any** AM4
  block from Axis (the A/B/C/D buttons), not just read the one the device is on — every block, not
  only amp/drive/reverb/delay.
- **AM4 — scene names & CRC check on backup/decode.** Backing up or decoding an AM4 preset now
  surfaces the four scene names and a CRC ✓/✗ integrity indicator.
- **VP4 — scene names & signal chain.** The VP4 now shows its four scene names and the real 4-slot
  chain (read from the preset structure in one shot), not just bare numbers.
- **Cab shown per slot.** A cab block's Type button now shows the loaded cabinet instead of a
  generic "Browse cabinet library".

### Changed
- **Faster cabinet picker.** The cab / IR picker now loads from a cache instead of re-reading the
  device every time it opens.
- **Lighter scene changes.** Switching scenes (on the device or in Axis) now refreshes through a
  lightweight scene-state read instead of a full preset re-dump — quicker, and it avoids the reload
  storms that could stall a scene change on heavier presets.

### Fixed
- **FM3, FM9 & Axe-Fx III — type/count selectors now send the right value.** Parameters like Chorus
  *Voices*, Cabinet *Type*, Reverb *Number of Springs* and other model/count selectors were sent as
  continuous knob values, which stored the wrong setting. They now send the correct discrete value.
- **AM4 — MIDI-config values read correctly.** Scene-select / CC-assignment and per-scene MIDI
  registers previously read back as 0; they now show the real number, and an unassigned assignment
  reads as **None**.
- **Cab reads the right channel (gen-3).** The cabinet readout could show channel A's cabinet even
  when another channel was active; it now reads the active channel.
- **Scene badge no longer flickers.** A failed scene read no longer bounces the scene number back
  and forth.

## 0.8.4-beta — 2026-07-07

### Added
- **AM4 tuner.** The AM4 now has a live tuner in Axis — big note + octave, a cents needle, the
  detected frequency, and the string highlight — the same tuner the other devices use. Open it
  from the tool rail or the top bar. *(Decoded from device captures; not yet confirmed on real
  hardware — if a reading looks off, please report it.)*
- **FM9 & Axe-Fx III — full effect model lists.** Every effect's **Type** picker now shows the
  complete model list (amps, drives, reverbs, delays, choruses, flangers, phasers…), matching the
  unit. FM9 previously showed only a few families; both devices are now complete.
- **FM9 & Axe-Fx III — real cabinet / IR names.** The cab picker now shows factory cabinet and IR
  names instead of bare numbers. (Your own USER IRs are still read live from the device.)
- **FM9 & Axe-Fx III — accurate knob ranges & units.** Parameter ranges and units now come from
  device-true data, so on-screen values line up with the hardware.

### Fixed
- **Drive/amp "Type" now changes the actual model (FM3, FM9, Axe-Fx III).** Picking a Drive block's
  type used to read and write the wrong parameter (a clipping/diode control) instead of the
  amp/drive model, so changing the type seemed to do nothing — or moved the wrong knob. It now
  targets the real model selector.
- **Front-panel scene changes now show up in Axis (FM3, FM9, Axe-Fx III, AM4).** Change the scene on
  the hardware (footswitch or front panel) and Axis follows — not just the scene number, but the
  whole grid: per-scene bypass, channels, and parameter values all refresh.
- **Switching amp channel on the device updates the amp name (FM3, FM9, Axe-Fx III).** Changing the
  amp block's channel (A–D) on the hardware now updates the amp model name and its parameters in
  Axis to match the device screen (previously only in-app channel switches did).

### Changed
- Bundled **ForgeFX engine** carries all of the above — the FM9/Axe-Fx III model lists, cabinet/IR
  names and ranges, the Type-selector fix, the front-panel scene & channel watches, and the AM4
  tuner.

## 0.8.3-beta — 2026-07-05

### Fixed
- **FM3 block types now populate for every effect.** Phaser, Chorus, Tremolo, Filter and Flanger
  showed an empty **Type** list and a blank type name; the model list is now resolved from the
  block's own TYPE data. (Closes the same gap wherever the data already ships for other gen-3
  devices.)
- **Per-block channel A–D switching refreshes the editor.** Switching a block's channel now reloads
  that channel's type and parameter values, instead of leaving the editor showing channel A.
- **Delay block editor no longer crashes.** Opening Delay hit a fatal duplicate-page-name error —
  its device layout ships a page named "More" that collided with the built-in catch-all "More"
  page. Page names are now de-duplicated (this also un-hides Delay's real "More" controls).

### Changed
- Bundled **ForgeFX engine** picks up the FM3 block-type and channel-read fixes above.

## 0.8.2-beta — 2026-07-04

### Added
- **Two more devices — Axe-Fx II and VP4 (community beta).** Axis now detects and edits the
  **Axe-Fx II** family (the 4×12 grid, 8 scenes, X/Y channels, per-block params, bypass, and
  preset backup) and the **VP4** (its 4-slot serial chain, block params, bypass, and save). Both
  auto-detect over USB-MIDI, or force the profile manually in the Axis hub → Connection. These
  ship **untested on hardware** — treat them as beta and confirm changes on the device. Known
  limits this release:
  - **VP4** lists the blocks a preset contains, but their order reflects **discovery order, not
    the true physical slot** (the slot-position read isn't decoded yet); writes are limited to
    continuous knob values, bypass, and save — block placement, scene switching, and rename are
    not yet decoded and are disabled.
  - **Axe-Fx II** is the more complete of the two; routing **cables aren't drawn** on its grid yet
    (blocks render and edit; the signal path between them isn't visualised).

### Changed
- Bundled **ForgeFX engine** gains the Axe-Fx II (gen-2) and VP4 device drivers plus their
  handshake / port-name detection; the forgefx-midi codec enables both model IDs.

## 0.8.0-beta — 2026-07-03

### Added
- **Axis in the browser — no install.** Open **axisapp.live** and click **Launch Axis in web**:
  the browser talks to your device directly over **Web MIDI** (FM9, Axe-Fx III, AM4 — or any unit
  through a MIDI interface) or **Web Serial** (FM3 over USB), running the full ForgeFX engine
  in-page. Everything works like the desktop app: the grid, block editing, scenes, tuner and
  meters, preset history with undo, snapshots and full-device backups (stored in the browser),
  free-tier cloud sync, and the **local storage folder** — pick a real folder on disk
  (Chrome/Edge) and get the same `Presets/` library + `Sync/` mirror as on desktop. The landing
  page's second button, **Launch Axis Remote**, is the existing control-your-PC mode.
  Browser support: Chrome/Edge on desktop = everything; Firefox & Android = MIDI devices (no
  FM3-over-USB, no folder picker); iOS/Safari can't reach devices — use Axis Remote there.

### Changed
- ForgeFX engine 0.5.0-beta: the device logic, version store, local folder and cloud sync now run
  on a portable runtime shared verbatim between the Node server and the browser (the HTTP API is
  unchanged — verified route-for-route by a parity test suite).

## 0.7.1-beta — 2026-07-03

### Added
- **Preset history with undo/redo.** Every edit to the active preset — knob moves, block
  place/remove/move, cables, bypass, channel, type, scene and renames — is recorded as a readable
  changelog ("Amp1 · Drive 4.2 → 6.8"). **Ctrl+Z / Ctrl+Shift+Z** undo and redo by replaying the
  inverse writes on the device; a knob drag coalesces into a single step. The History panel (new
  rail button) lists every step with revert-to-here; history persists per preset across restarts.
  Loading a snapshot/file into the edit buffer sets a barrier — the log is kept, undo stops there.
- **Unsaved-changes guard.** Closing Axis with an edited (unsaved) buffer now asks first — a native
  dialog on the desktop app, the browser prompt in web mode.
- **Local storage folder.** Pick a folder (Axis hub → Storage) and Axis manages `Presets/` — a
  browsable `.syx` library scanned straight from disk (drop your collections in; audition any of
  them into the edit buffer without touching device slots; "Save to Axis folder" from the browser's
  context menu) — and `Sync/` — your preset versions mirrored as plain, tool-readable `.syx` files
  plus an index, auto-synced after every snapshot/backup, **unlimited, no account needed**. A
  Restore action re-imports everything on a fresh machine.
- **Cloud preset sync for free accounts.** Preset versions + full-device backups now sync for
  everyone: the free plan includes **3 MB of preset storage, your most recent full device backup,
  and 5 snapshots** (a full FM3 backup is ~1.6 MB — it fits comfortably); supporters stay
  unlimited. The account panel shows a live storage/snapshot usage bar, and a new full backup
  replaces the previous one in the cloud after a confirmation. Nothing is ever deleted from a
  formerly-supporter account — over-quota pushes are refused, never pruned silently.

## 0.7.0-beta — 2026-07-03

### Added
- **Grid Map navigator.** A collapsible miniature of the whole signal chain inside the block
  editor — tap a block to jump the editor to it, tap an empty cell to add a block there, tap a
  port to route. Fit-to-width with zoom; built for mobile, handy everywhere.
- **Tap-to-connect routing.** Tap a port to arm it (no more drag needed), then tap ANY block in a
  later column — on the map or the main grid, even across mobile pages. Shunts are laid
  automatically across any distance.
- **Audition presets (Axe-Change style).** Library device presets get an "Audition" action that
  loads them into the edit buffer without switching slots or saving anything.
- **Foot Controller editor on FM9 and Axe-Fx III.** FM9 gets the full layout × switch editor via
  its device-true address model; the Axe-Fx III gets flat per-config editing. Writes are blind
  (no live read-back yet) but device-true; live read-back stays FM3-only for now.
- **Device Tools for every model.** Backup/restore a preset as `.syx`, offline-decode `.syx`
  files, validate firmware files, and view the modifier model — each section appears when the
  connected device supports it (this also brings the former AM4-only tools to the FM3/FM9/III).

### Changed
- **The bundled engine was rebuilt on a per-device driver architecture** over the shared
  `forgefx-midi` codec package, with a unified, capability-driven API. Every FM3 response was
  byte-for-byte verified unchanged through the migration; the recurring
  wrong-codec-for-the-device bug class is structurally gone.
- Cloud badges are honest now: a preset that is on the device can no longer be mislabeled
  "Cloud only"; entries without a comparable revision show a neutral "sync state unknown".

### Fixed
- **Axe-Fx III on Windows connects again** — detection previously never switched off the FM3
  profile for USB-MIDI-only units, so every request timed out ("device offline").
- **Export to disk works for device presets** — it had been silently broken from the start
  (the export hit an API route that never existed) and now downloads a real dump.

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
