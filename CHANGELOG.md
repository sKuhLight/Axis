# Changelog

Notable changes per release, for Axis and its bundled ForgeFX engine. Newest first.

## 0.4.23-beta — 2026-07-01

### Added
- **Privacy & Diagnostics.** New panel (🛡 in the tool rail) with **opt-in** anonymous
  diagnostics (off by default) that help fix bugs faster — no personal data, no
  presets. Plus an on-demand **"Send debug report"** and an automatic prompt after a
  device error, so you can share a scrubbed diagnostic bundle in one click.
- **Delete account & data.** The account panel can now permanently erase your account
  and all cloud data (GDPR).
- **Legal links.** Registration shows the Terms & Privacy agreement, and the app links
  to the Privacy Policy / Terms / Imprint at axisapp.live.

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
