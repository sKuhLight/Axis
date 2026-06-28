# Axis / ForgeFX — Feature Roadmap (gap analysis)

> Living roadmap for Axis + ForgeFX. Derived from a survey of the `fractal-midi` protocol surface and
> the current implementation (2026-06-28). It records what the protocol *can* do vs. what we ship today,
> so the work can be sequenced. Not a dated promise list — priorities shift with the beta.

## How to read the "Protocol" column
- **Wired** — builder/parser exists in `fractal-midi` *and* we already use it.
- **Available** — builder/parser exists in `fractal-midi`, we just haven't wired an endpoint/UI.
- **Reachable** — no dedicated builder, but doable through the generic param codec (need a data model + UI).
- **Needs RE** — not exposed by the 3rd-party SysEx protocol; requires capture/reverse-engineering, or may not be possible over MIDI at all.

---

## What we already ship (the "have" side)
Signal Grid (place/clear/cable/move, animated cables, swipe meters, mobile paging) · Block editor with
widget-grid Control Surface (knob/fader/slider/number/switch/select/EQ/action, arrange mode, custom
per-family tabs) · Cab/DynaCab picker · Command palette (place + retype, favorites/recents) · Preset
picker + nav · **Tuner** overlay (live Hz/note/cents over SSE) · **Tempo** (get/set/tap) · **Scene**
switch (8 buttons, per-scene bypass/channel sync) · per-block bypass/channel/retype · live param
bulk-read · device **auto-detect** (FM3/FM9/Axe-Fx III) · SSE event stream · meters.

ForgeFX: ~29 endpoints. Multi-device via `DeviceProfile` (FM3 0x11, FM9 0x12, Axe-Fx III 0x10).

---

## The six empty rail screens (user-visible "coming soon" stubs)
These are the headline gaps — each is a whole screen the OG editors have and we don't.

### 1. Setup / Settings (⚙)  — *device-global configuration*
The big one you named. The gen-3 **GLOBAL block** (~228 params) is **Reachable** through our existing
param codec — we can read/write it today, we just have no endpoint or screen. Covers:
- I/O input/output levels, output mode, copy in1→in2, etc.
- Global EQ (per-output graphic EQ)
- MIDI: device MIDI channel, PC/CC mapping, SysEx ID, USB adapter mode
- Tuner reference pitch (A=440), tuner display options
- Tempo/metronome, global click
- Pedal/expression calibration, global settings persistence

  **Effort:** moderate. Enumerate the GLOBAL/SETUP families from the device profile, build a
  settings endpoint group (`GET/PUT /settings/...`), render with the existing Control Surface widgets.
  Watch: some "settings" are system-level (not in the GLOBAL effect block) and may be **Needs RE**.

### 2. FC Edit / Footswitches (⬚)  — *footswitch + expression mapping*
The other one you named — **and the hardest.** Both `fractal-midi` and `mcp-midi-control` flag the
**FC / footswitch-controller blocks as `addressable: false` — there are no FC builders.** The
per-switch layout/function mapping is **not exposed in the 3rd-party SysEx protocol** the way params
are. Realistic paths:
- **Needs RE:** the FC layout/function mapping isn't in the documented 3rd-party surface, so it needs
  reverse-engineering. It may live in the preset/global binary blob.
- If so, it's only editable via the **preset/system dump binary**, which means we'd first need a
  **preset-binary parser** (we have dump *request* builders but **no parser** — see §9).
- Honest expectation: this is a research project, not a wiring task. Scope a spike before promising it.

### 3. Scene Manager (❏)  — *beyond just switching scenes*
Scene **switching** is wired. Missing the management surface:
- **Scene naming** — `buildSetSceneName` / `buildQuerySceneName` are **Available** (names already
  decode into `PresetGridDTO.scenes`). Just need edit UI.
- Per-scene **copy / clear / reset**, "scene ignore" per block (the BlockEditor footer stub),
  scene-level bypass/channel matrix view, **scene controllers** (per-scene values).
  **Effort:** naming = easy; copy/ignore/controllers = moderate (touches modifiers, see §5).

### 4. Sets & Songs / Preset Librarian (≣)  — *bank browsing + backup*
Currently only a `GET /presets/:n` stub. Missing:
- **Bulk name scan** across banks — `buildQueryPatchName` is **Available** (mcp's `scan_locations`).
- **Preset rename** — `buildRenamePreset` **Available**.
- **Backup / restore** to `.syx` — mcp ships `export_preset`/`import_preset`; for us the dump
  *request* builders exist but **no binary parser** (§9) → restore is the blocker.
- Preset copy/move, setlists, tagging, search/favorites (favorites pattern already exists client-side).
  **Effort:** name scan + rename = easy; backup/restore = moderate→hard (needs the parser).

### 5. Controllers & Modifiers (⊜)  — *the expressiveness engine*
Fractal's whole modulation system: **LFO 1/2, ADSR, Envelope, Sequencer, Pitch, Manual, Scene
controllers**, and **modifier assignment** (bind any param to a controller + min/max/curve). This is
arguably the most-requested "real editor" feature and we have nothing.
- Modifier *params* are **Reachable** via the generic codec, but there's **no modifier data model**
  (which params have modifiers attached, the source, the curve). mcp also lacks a modifier-set API.
- gen-2 even has dedicated opcodes (`MODIFIER_SET`, `GET_MODIFIER_INFO`, `MODIFIER_DUMP`) — gen-3
  likely embeds modifier state in the preset binary → again points at the **parser** (§9) + an RE spike.
  **Effort:** hard. Highest user value, but needs the preset-binary model. Phase it.

### 6. Perform / Live (▷)  — *stage view + looper*
- Big-button performance view (scenes/presets as large tap targets, tuner, tempo) — UI-only, easy.
- **Looper** — `fractal-midi` has the **full looper API Available** (`buildSetLooper`
  record/play/undo/once/reverse/half-speed + `buildGetLooperState`/`parseLooperStateResponse`).
  Wire `POST /looper {action}` + `GET /looper` + SSE state. **Effort:** easy. Quick win.

---

## Cross-cutting capabilities (not a single screen)

### 7. Status / health
- `buildStatusDump` (fn 0x13, per-block bypass+channel snapshot) is **Available** — a cheaper
  whole-preset state read than our per-block polling.
- **CPU load** — still **Needs RE** (not in public spec; FM3-Edit shows it via undocumented SysEx).
- Inbound **checksum validation** — we build checksums but don't validate responses. Hardening.

### 8. Preset store/save robustness
We have a basic `POST /preset/store`. mcp enforces guards we lack: **overwrite protection** (warn if
target slot occupied + return occupant name), **rename-on-save**, dirty-buffer gate. **Available** /
easy — `buildStorePreset` + `buildRenamePreset` + a name scan.

### 9. Preset-binary parser  *(unlocks §2, §4-restore, §5)*
We have `buildRequestPresetDump` / `buildRequestEditBufferDump` (request builders) but **no parser for
the returned 0x77/0x78/0x79 (stored) or 0x51/0x52 (edit-buffer) frames.** This single capability is the
keystone for: full backup/restore, FC layout editing, and the modifier data model. mcp's gen-3
"stored preset decode" path is the reference (it decodes grid + per-channel types + 8 scene names +
per-scene bypass/channel + amp model + knobs + modifiers + scene controllers). **Effort:** hard but
high-leverage — building this once lights up three other screens.

### 10. Cross-device preset translation
mcp's `translate_preset` moves a preset between device classes (AM4↔II↔III↔FM3↔FM9: chain topology,
block availability, param aliases, enum mapping, channel collapse, scene-count). Differentiating Axis
feature. **Effort:** moderate, depends on §9.

### 11. IR / Cab library management
Cab *picker* (select IRs into a preset) is done. Missing **user IR library** (list/rename/upload user
cabs). Likely **Needs RE** for upload (gen-2 has `CABIR_RCV`/`DELETE_CABIR`/`CONTROL_IRCAP` opcodes;
gen-3 unverified). Low priority.

---

## Device coverage gaps (codec breadth)
The profile system covers the gen-3 grid family. Recognized-but-unwired (data exists in `fractal-midi`):
- **VP4 (0x14)** — own value codec, no grid. Builders Available (`buildVp4SetParam/SetBypass/Save`),
  reads decoded; writes untested on hardware. Separate codec path.
- **AM4 (0x15)** — 4-slot linear, own encode + preset binary. Full builder set Available. Separate path.
- **Axe-Fx II (0x07, gen-2)** — full opcode set + builders Available (X/Y channels, 0x02 codec).
- **Axe-Fx Std/Ultra (gen-1)** — param catalog only, no builders.
  **Effort:** each is a self-contained codec wiring job; do on demand / when a tester appears.

---

## Suggested sequencing
**Quick wins (Available + easy, days each):**
1. Looper (§6) — full API ready.
2. Scene naming (§3) — builder ready, names already decoded.
3. Preset name-scan + rename + save-overwrite guard (§4, §8).
4. Status-dump fast path (§7).
5. Perform/Live big-button view (§6, UI-only).

**Moderate (a profile/endpoint pass each):**
6. Setup/Settings screen from the GLOBAL block (§1).
7. Performance/librarian polish, favorites/setlists (§4).

**Keystone, then the hard screens:**
8. **Preset-binary parser (§9)** — build this next; it unlocks ↓
9. Backup/restore `.syx` (§4), then
10. Modifiers/Controllers screen (§5), then
11. FC Edit (§2) — RE spike, scope after the parser exists.

**Opportunistic:** cross-device translation (§10), extra device codecs (VP4/AM4/II), IR library (§11),
CPU load (§7, needs capture).
