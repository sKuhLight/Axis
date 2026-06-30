// Shapes mirroring the ForgeFX HTTP API + definition packs.

/** A parameter as defined in a ForgeFX definition pack (fm3-<block>.json). */
export interface ParamDef {
  index: number;
  name: string;
  unit?: string;
  min?: number;
  max?: number;
  scale?: 'Linear' | 'Log' | 'Raw';
  type?: 'knob' | 'switch' | 'select' | 'slider' | 'balance';
  options?: Record<string, string>;
  // UX metadata layer (curated; drives the Axis block gestures/tiers/EQ widgets)
  role?: 'primaryLevel' | 'primaryMix';
  tier?: 'basic' | 'advanced';
  group?: 'inputEQ' | 'outputEQ' | 'graphicEQ';
}

/** A named parameter value read back from the device (GET /block/{name}/params). */
export interface NamedParam {
  /** Device-true paramId — disambiguates duplicate display labels (e.g. amp's two "Depth"s). */
  id?: number;
  name: string;
  value: number;
  unit?: string;
  norm?: number;
  /** Device-true display bounds (for a live readout while dragging). */
  min?: number;
  max?: number;
  /** Log10 taper (e.g. frequency cuts) — interpolate geometrically, not linearly. */
  log?: boolean;
}

/** A discrete (enum) parameter read back from the device — rendered as a dropdown/switch. */
export interface EnumParam {
  id: number;
  name: string;
  value: number;
  options: { value: number; label: string }[];
}

/** One control on a device-authentic editor page: a display label bound to a paramId. */
export interface LayoutControl {
  label: string;
  paramName: string;
  paramId: number | null;
  col?: number;
}
/** Device-authentic UI layout for a block/virtual effect: editor pages (tabs) → controls. */
export interface DeviceLayout {
  editorName?: string;
  pages: { name: string; controls: LayoutControl[] }[];
}

export interface BlockParams {
  block: string;
  slug?: string;
  page: number;
  named: NamedParam[];
  enums: EnumParam[];
  type: { value: number; name: string } | null;
  /** Device-authentic editor pages (seeds the ControlSurface "Default" layout). */
  layout?: DeviceLayout;
}

/** Foot Controller (eid 199) address model — field bases + config formula + enums. */
export interface FcFieldDef {
  base: number;
  width: number;
  stride: number;
  verified: boolean;
}
export interface FcSlot {
  i: number;
  role: string;
  type: 'preset' | 'scene' | 'channel' | 'block' | 'int' | 'enum' | 'bool';
  min?: number;
  max?: number;
  options?: string[];
}
export interface FcFunctionDef {
  ord: number;
  name: string;
  slots: FcSlot[];
  labels: string[];
}
export interface FcModel {
  effectId: number;
  switches: number;
  views: number;
  layouts: number;
  configsPerLayout: number;
  labelLen: number;
  paramsWidth: number;
  fields: Record<string, FcFieldDef>;
  categories: Record<string, string>;
  colors: Record<string, { name: string; hex: string }>;
  labelModes: Record<string, string>;
  /** category ordinal → its function definitions (may be empty for not-yet-modelled categories). */
  functions: Record<string, FcFunctionDef[]>;
  channels: string[];
}
/** One side (tap/hold) of an FC switch from the sub-0x01 structured read. `present` = the device
 *  returned a record matching the requested config/side; `raw` = the 78-byte response body (per-switch
 *  record at raw[16..]; interior field offsets not yet decoded). */
export interface FcSideState {
  selector: number;
  present: boolean;
  /** true when the slot reads as unassigned (primary value region 0,0). Presence hint, not a decode. */
  empty: boolean;
  raw: number[];
}
export interface FcSwitchState {
  effectId: number;
  layout: number;
  view: number;
  switch: number;
  config: number;
  tap: FcSideState;
  hold: FcSideState;
}
/** Decoded current switch state (GET /fc/state) read via the sub-0x1b value channel — the read that
 *  tracks param edits. `fields` holds raw ordinals keyed by FC field name (tapCategory, tapFunction,
 *  tapDisplay, holdCategory, holdFunction, holdDisplay, color); `null` = unreadable. Labels are text. */
export interface FcReadState {
  effectId: number;
  layout: number;
  view: number;
  switch: number;
  config: number;
  fields: Record<string, number | null>;
  tapLabel: string;
  holdLabel: string;
}

/** Modifier (eid 3) address model — field → paramId. */
export interface ModFieldDef {
  pid: number;
  kind: 'ordinal' | 'norm' | 'bipolar' | 'ref';
  verified: boolean;
  role?: string;
}
export interface ModSource {
  name: string;
  ordinal: number;
}
export interface ModModel {
  effectId: number;
  slotCount?: number;
  fields: Record<string, ModFieldDef>;
  sources?: ModSource[];
}

/** One decoded parameter of a placed block (GET /presets/:n/params, or embedded in a file summary). */
export interface DecodedParam {
  paramId: number;
  /** Catalog symbol, e.g. DISTORT_TYPE. */
  name: string;
  /** Human label, e.g. "Gain", "Type". */
  label: string;
  /** 'enum' | 'float' | … (undefined if the param has no range row). */
  kind?: string;
  /** Raw stored value (0..65534 model). */
  raw: number;
  /** Display value for numeric params; null for enums. */
  value: number | null;
  unit?: string;
  /** Resolved label for enum/type/model params. */
  enumLabel?: string;
}
/** One placed block with its full decoded params — the deep-search + browser-detail unit. */
export interface DecodedBlock {
  effectId: number;
  family: string;
  slug: string;
  instance: number;
  /** Amp only: channel index 0-3 (A-D). */
  channel?: number;
  typeName: string | null;
  params: DecodedParam[];
}

/** A stored preset version snapshot (GET /versions). */
export interface VersionInfo {
  id: string;
  location: number;
  crc: number;
  name: string;
  model: string;
  capturedAt: number;
  source: 'manual' | 'auto' | 'backup';
  backupId?: string;
  bytes: number;
  stored: number;
}

/** A version as the cloud sees it (GET /cloud/index) — metadata only, used to compute per-preset sync state.
 *  Version ids are deterministic (location+crc+ts), so a local VersionInfo is "in cloud" iff its id is here. */
export interface CloudVersion {
  id: string;
  location: number;
  crc: number;
  name: string;
  model: string;
  capturedAt: number;
  source: string;
  bytes: number;
  stored: number;
}

/** Per-preset cloud sync state, computed from device CRC + local versions + the cloud index. */
export type SyncState = 'synced' | 'modified' | 'outdated' | 'cloudOnly' | 'deviceOnly' | 'none';

/** A unique effect block in a preset (for the library/browser). */
export interface PresetSummaryBlock {
  effectId: number;
  slug: string | null;
  name: string;
  instance: number | null;
}
/** Decoded preset summary for the library: name, scenes, and the blocks it contains. */
export interface PresetSummary {
  number: number;
  name: string;
  model: string;
  crcValid: boolean;
  /** Content fingerprint (stored CRC16) — changes when the preset changes; used to detect a stale cache entry. */
  crc?: number;
  scenes: string[];
  blocks: PresetSummaryBlock[];
  /** Distinct model names in use per block family (amp/drive/cab/reverb/…) — for "presets using model X".
   *  Keyed by family slug; only families with a decoded model are present. */
  models: Record<string, string[]>;
  /** Distinct amp-model names used (across the amp's channels) — for "presets using amp X".
   *  Back-compat alias of `models.amp`. */
  amps: string[];
  /** Full per-block decoded params (every family/param) — for deep search. Present on file imports
   *  and after a device preset's params are hydrated (GET /presets/:n/params); absent on bulk scan. */
  params?: DecodedBlock[];
}

/** Result of the device auto-detect handshake (GET /device/detect). */
export interface DetectResult {
  connected: boolean;
  modelId: number;
  name: string;
  short: string;
  gen: number;
  supported: boolean;
  port: string | null;
}

/** One cab slot's current selection + the param ids to write it. */
export interface CabSlot {
  slot: number;
  bankParam: number;
  irParam: number;
  dynaParam: number;
  bank: { value: number; label: string };
  irIndex: number;
  irName: string;
  dyna: { value: number; label: string };
}
/** Cab block state for the IR picker (GET /preset/blocks/:eid/cab). */
export interface CabState {
  modeParam: number;
  mode: { value: number; label: string };
  modeOptions: { value: number; label: string }[];
  bankOptions: string[];
  dynaOptions: { value: number; label: string }[];
  slots: CabSlot[];
  error?: string;
}

/** A control value on the grid meter (norm for the fill + device-true display value). */
export interface MeterVal {
  norm: number;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  log?: boolean;
}
/** A placed block's meter payload (GET /preset/meters). */
export interface BlockMeter {
  effectId: number;
  slug: string;
  defaultId: number;
  defaultName: string;
  typeName: string;
  vals: Record<number, MeterVal>;
}

/** Live device push streamed over SSE (GET /events). */
export type DeviceEvent =
  | { type: 'tuner'; freq: number; note?: string; cents?: number; octave?: number }
  | { type: 'tempo'; bpm: number }
  | { type: 'scene'; index: number }
  | { type: 'cpu'; percent: number }
  | { type: 'meters'; input: number; outL: number; outR: number };

/** A user-defined parameter tab within a block family (persisted client-side). */
export interface TabDef {
  id: string;
  name: string;
  /** Device-true paramIds assigned to this tab, in display order. */
  paramIds: number[];
}

/** A tab as rendered in the editor: built-in (Ideal/Advanced) or a user custom tab. */
export interface ResolvedTab {
  id: string;
  name: string;
  ids: number[];
  builtin: boolean;
}

export interface Firmware {
  version: string;
  build: string;
}

/** GET /device — identity + firmware. */
export interface DeviceInfo {
  model: string;
  modelByte: string;
  firmware: Firmware | null;
  port: string;
}

export interface Health {
  ok: boolean;
  device: string;
}

/** GET /preset, /presets/{n} — preset number + name. */
export interface PresetRef {
  number: number;
  name: string;
}

/** GET /blocks — one catalog entry. */
export interface BlockSummary {
  slug: string;
  name: string;
  page: number;
  paramCount: number;
  typeCount: number;
}

/** GET /preset/blocks — a placed block: position + routing + live bypass/channel. */
export interface PresetBlock {
  slug: string;
  name: string;
  effectId: number;
  row: number;
  col: number;
  fromRows: number[];
  bypassed: boolean | null;
  channel: string | null;
}

/** One occupied cell of the real routing grid (from /preset/grid). */
export interface GridCell {
  row: number;
  col: number;
  effectId: number;
  name: string;
  isShunt: boolean;
  /** Routing input mask: bit r set = fed from row r of the previous column. */
  routeFlag: number;
  /** Rows of the previous column that feed this cell (decoded from routeFlag). */
  fromRows: number[];
}

/** The decoded preset routing grid (from /preset/grid). */
export interface PresetGrid {
  model: string;
  name: string;
  crcValid: boolean;
  rows: number;
  cols: number;
  scenes: string[];
  cells: GridCell[];
}

// connection picker (serial + MIDI ports)
export type ConnPick = { transport: 'serial' | 'midi'; id: string; inId?: string; outId?: string };
export interface ConnInfo extends ConnPick {
  label: string;
  fractal: boolean;
  model?: string;
  /** MIDI only: which endpoint (USB-MIDI units expose In + Out separately). */
  dir?: 'input' | 'output';
}
export interface PortList {
  chosen: ConnPick | null;
  override: ConnPick | null;
  ports: ConnInfo[];
}
