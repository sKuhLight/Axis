# Changelog

Notable changes per release, for Axis and its bundled ForgeFX engine. Newest first.

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
