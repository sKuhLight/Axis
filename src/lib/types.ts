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
  base?: number;
  width?: number;
  stride?: number;
  verified?: boolean;
  pid?: number;
  paramName?: string;
  evidence?: string;
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
  paramsWidth: number;
  /** Total addressable FC configs. */
  configs: number;
  fields: Record<string, FcFieldDef>;
  categories?: Record<string, string>;
  labelModes?: Record<string, string>;
  /** True when the device supports the live per-switch state read (`GET /fc/state`). FM3 only;
   *  FM9/III expose the address model but not live read (config decomposition / labels not recovered). */
  liveState: boolean;
  // ── FM3-only live-read geometry + display metadata (present when liveState) ──
  switches?: number;
  views?: number;
  layouts?: number;
  configsPerLayout?: number;
  labelLen?: number;
  colors?: Record<string, { name: string; hex: string }>;
  /** category ordinal → its function definitions (may be empty for not-yet-modelled categories). */
  functions?: Record<string, FcFunctionDef[]>;
  channels?: string[];
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

/** GET /telemetry/status — telemetry gate state. `enabled` = live RUM (AXIS_TELEMETRY=1); `uploadEnabled`
 *  = the on-demand debug-report upload is available (Supabase configured), independent of live telemetry. */
export interface TelemetryStatus {
  enabled: boolean;
  faroUrl: string;
  key: string;
  uploadEnabled: boolean;
}
/** Debug-report bundle uploaded by POST /telemetry/report. Scrubbed of PII before sending. */
export interface DebugReport {
  instanceId: string;
  capturedAt: number;
  app: { version: string; platform: string };
  /** Optional contact the user chose to leave (Fractal forum / Reddit / email), ≤100 chars. Opt-in. */
  contact?: string;
  trigger?: { kind: string; route?: string; status?: number; message?: string };
  diag?: unknown;
  log?: string;
  events?: { t: number; kind: string; text: string }[];
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
  /** Present when `sources` is empty because the device's source enum is runtime-built / capture-pending. */
  sourcesNote?: string;
  /** ADDITIVE (API v2): whether the wire binding (POST /mod/bind) is supported (gen-3 true, AM4 false). */
  bindingSupported?: boolean;
}

/** Per-block monitor (meter) param table (GET /preset/monitors): paramName → pid + role + dB range. */
export type MonitorParams = Record<string, {
  family: string;
  pid: number;
  role: string;
  minDb?: number;
  maxDb?: number;
  widgetConfirmed: boolean;
}>;

/** Live per-block audio meter (GET /preset/monitors/live): normalized 0..1 level + mapped dB. */
export interface LiveMonitor {
  effectId: number;
  family: string;
  paramName: string;
  role: string;
  norm: number;
  db: number | null;
  minDb?: number;
  maxDb?: number;
}

// ── AM4 (model 0x15) ──
export interface Am4ModifierModel {
  effectOrdinal: number;
  slotCount: number;
  fields: Record<string, { cacheId: number; kind: string; symbol: string; role: string }>;
  sources: { ordinal: number; name: string }[];
  operations: string[];
  channels: string[];
  bindingSupported: boolean;
  note: string;
}
export interface Am4Backup {
  location: number | null;
  code: string | null;
  name: string;
  bytes: number[];
}
export interface Am4Decode {
  count: number;
  presets: { index: number; location: number | null; code: string | null; name: string }[];
}
export type Am4FirmwareResult =
  | { valid: true; messages: number; blocks: number; headerTag: number[]; finalizeTag: number[] }
  | { valid: false; error: string };

// ── unified device tools (API v2, capability-gated server-side) ──
/** GET /preset/locations (caps presets.canScanNames) — fast stored-location name scan. */
export interface PresetLocations {
  count: number;
  locations: { location: number; code: string | null; name: string; isEmpty: boolean }[];
}
/** POST /preset/backup — verbatim .syx dump of one preset (caps backupDump). */
export interface PresetBackup {
  location: number | null;
  code: string | null;
  name: string;
  bytes: number[];
}
/** POST /firmware/validate result (caps firmwareValidate) — same shape as the AM4 validator. */
export type FirmwareValidateResult = Am4FirmwareResult;
/** POST /preset/decode (JSON bytes) — gen-3 dumps decode to a PresetSummary; AM4 dumps to a
 *  location/name listing. Discriminate on the presence of `presets`. */
export type SyxDecodeResult = PresetSummary | ({ model: string } & Am4Decode);

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

/** Per-preset cloud sync state, computed from device CRC + local versions + the cloud index.
 *  'unknown' = the preset IS on the device and a cloud version exists, but the entry carries no
 *  CRC to compare (name-scan devices, stale cache rows) — never mislabel that as cloud-only. */
export type SyncState = 'synced' | 'modified' | 'outdated' | 'cloudOnly' | 'deviceOnly' | 'unknown' | 'none';

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
  | { type: 'meters'; out1L: number; out1R: number; out2L: number; out2R: number }
  // Live cross-UI change sync (multi-window + Axis Cloud Remote): `param` = another UI moved a knob;
  // `changed` = a structural change (grid/preset) → reload.
  | { type: 'param'; effectId: number; paramId: number; norm: number }
  | { type: 'changed'; scope: 'grid' | 'preset' }
  // A shared Axis config doc (layouts / swipe quick-actions / tags / surface arrange …) was written by
  // another UI — apply it live so both directions stay in sync without a reload. `origin` = the writer's
  // client id, so a UI ignores its own echo.
  | { type: 'config'; id: string; data: unknown; origin?: string };

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

/** Preset-related capabilities (API v2). `addressing` drives how save targets render
 *  ('numeric' = 000..511; 'bankLetter' = A01..Z04). */
export interface PresetCaps {
  count: number;
  addressing: 'numeric' | 'bankLetter';
  canRename: boolean;
  /** Device supports a fast stored-location name scan (GET /preset/locations). */
  canScanNames: boolean;
  /** Device supports full preset dumps → deep param index (GET /presets/:n/summary?full=1). */
  canDeepScan: boolean;
  /** Device answers the live current-preset query (safe to poll). */
  liveQuery: boolean;
}

/** Per-device capabilities (from the forgefx-midi descriptor) — drives which UI a model gets.
 *  The v2 fields are optional so a pre-v2 (legacy) server payload still typechecks. */
export interface DeviceCaps {
  slotModel: 'linear' | 'grid';
  slotCount?: number;
  grid?: { rows: number; cols: number };
  hasScenes: boolean;
  sceneCount: number;
  hasChannels: boolean;
  channelNames: string[];
  channelBlocks: string[];
  supportsSave: boolean;
  // ── API v2 additions (capabilities-driven unified API) ──
  presets?: PresetCaps;
  /** Grid routing (cables/shunts) exists on this device (gen-3 grid; false on the AM4's flat slots). */
  gridRouting?: boolean;
  /** Device supports mirroring the UI selection onto its screen (grid cursor-select). */
  gridCursorSelect?: boolean;
  /** Routing/shunt cell base effect id (gen-3: 1024). */
  shuntBase?: number;
  /** Blocks can expose params without a gen-3 definition pack. */
  paramsWithoutPack?: boolean;
  tempo?: boolean;
  tuner?: boolean;
  meters?: { blockMeters: boolean; liveMonitors: boolean; outputLevels: boolean; cpu: boolean };
  sceneNamesWritable?: boolean;
  fc?: { model: boolean; liveState: boolean };
  modifiers?: { model: boolean; bind: boolean };
  cabIrs?: boolean;
  firmwareValidate?: boolean;
  backupDump?: boolean;
  restoreDump?: boolean;
  versionStore?: boolean;
  deviceParams?: boolean;
  /** Rail-screen virtual effects this device exposes (Setup/Controllers/Modifier/FC …). */
  virtualEffects?: { eid: number; slug: string; name: string }[];
}

/** GET /device — identity + firmware + capabilities. */
export interface DeviceInfo {
  model: string;
  modelByte: string;
  modelId?: number;
  /** Unified-API version the server speaks (2 = capabilities-driven device-agnostic API). */
  apiVersion?: number;
  capabilities?: DeviceCaps | null;
  firmware: Firmware | null;
  port: string;
}

export interface Health {
  ok: boolean;
  /** API version envelope (v2 servers). Absent on legacy servers. */
  api?: { version: number };
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
  /** ADDITIVE (API v2): catalog slug where derivable (AM4 cells carry it; gen-3 cells omit it). */
  slug?: string | null;
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
/** Manual device-profile override (Axis "Connection & Device"). 'auto' = detect. */
export type ProfileKey = 'auto' | 'fm3' | 'fm9' | 'axe3' | 'am4';
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
  /** Forced device-profile key, or null when auto-detecting. */
  profileOverride: string | null;
  /** The engine's currently-active profile. */
  profile?: { key: string; name: string; model: string };
  ports: ConnInfo[];
}
