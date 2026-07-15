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

/** Editor widget kind for a layout control (from the official editor's per-control renderer).
 *  `unknown` = the source layout had no recognized widget (legacy/migrated data) — render with the
 *  catalog's own heuristic so it degrades to the pre-v2 behaviour. */
export type LayoutWidget =
  | 'knob'
  | 'toggle'
  | 'slider'
  | 'dropdown'
  | 'graph'
  | 'spacer'
  | 'button'
  | 'meter'
  | 'label'
  | 'readout'
  | 'unknown';

/** A layout control that binds to a DIFFERENT block than the one being edited (rendered live via the
 *  pinned-param hydration when `paramId` resolves; display-only otherwise). */
export interface LayoutCrossBlock {
  /** Effect id of the block that owns the parameter. */
  effect: number;
  family: string;
  paramName: string | null;
  paramId: number | null;
}

/** Fine placement metadata from the editor grid (stored, not yet rendered — later polish pass). */
export interface LayoutPlacement {
  col?: number;
  offsetX?: number;
  offsetY?: number;
  positionExact?: boolean;
}

/** One control on a device-authentic editor page: a display label + widget kind bound to a paramId. */
export interface LayoutControl {
  label: string;
  paramName: string | null;
  paramId: number | null;
  widget: LayoutWidget;
  /** The source editor's raw widget token (e.g. `dropdown1`, `meterGainVert`, `btnBypass`). */
  rawWidget?: string;
  placement?: LayoutPlacement;
  crossBlock?: LayoutCrossBlock;
  fw?: unknown;
}
/** One row of a layout page: controls flow left→right; rows flow top→bottom within the page. */
export interface LayoutRow {
  /** Editor section tag (e.g. `parameters`, `mixer`) — informational. */
  section?: string;
  controls: LayoutControl[];
}
/** One editor page (rendered as a tab): a title + its rows. */
export interface LayoutPage {
  name: string;
  pageNum?: number;
  fw?: unknown;
  rows: LayoutRow[];
}
/** Device-authentic UI layout for a block/virtual effect. The server has ALREADY selected the variant
 *  matching the block's current type, so `pages` are the arrangement to render as-is. */
export interface DeviceLayout {
  editorName?: string;
  family: string;
  variantName?: string;
  variantValue?: string | null;
  fw?: unknown;
  pinned?: unknown;
  pages: LayoutPage[];
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

/** Device-telemetry polling mode (META-17). `performance` = snappiest reflection / most traffic;
 *  `balanced` = default; `reduced` = minimal background traffic for stage use. */
export type TelemetryMode = 'performance' | 'balanced' | 'reduced';
/** GET/PUT /telemetry/config — the active polling mode, the server's resolved interval set, and the
 *  modes the server offers. `effective` is opaque server detail (interval numbers) surfaced for display. */
export interface TelemetryConfig {
  mode: TelemetryMode;
  effective: Record<string, unknown>;
  modes: TelemetryMode[];
}
/** Cumulative device-traffic counters pushed on the DeviceEvent bus (`traffic` event). Rates are computed
 *  client-side from deltas between successive snapshots. `loops` = the currently-active poll loops. */
export interface TrafficSnapshot {
  txMsgs: number;
  txBytes: number;
  rxMsgs: number;
  rxBytes: number;
  /** Epoch (ms) the counters were last reset — lets a client detect a counter reset (reconnect). */
  since: number;
  /** Active background poll loops (e.g. ['meters','editWatch']). */
  loops: string[];
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
  /** ADDITIVE (opt-in container decode alongside the opaque `bytes`): the four plaintext scene names. */
  sceneNames?: string[];
  /** ADDITIVE: whether the dump's stored CRC validated. */
  crcValid?: boolean;
}
export interface Am4Decode {
  count: number;
  presets: {
    index: number;
    location: number | null;
    code: string | null;
    name: string;
    /** ADDITIVE (opt-in): the four plaintext scene names of this preset. */
    sceneNames?: string[];
    /** ADDITIVE: whether this preset's stored CRC validated. */
    crcValid?: boolean;
  }[];
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
  /** ADDITIVE (opt-in container decode alongside the opaque `bytes`; AM4): plaintext scene names. */
  sceneNames?: string[];
  /** ADDITIVE: whether the dump's stored CRC validated. */
  crcValid?: boolean;
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

// ── local storage folder (ForgeFX /local/*: Presets/ library + Sync/ plain-syx mirror) ──
export interface LocalConfig {
  configured: boolean;
  root: string | null;
  exists: boolean;
  writable: boolean;
  lastSync: number | null;
}
/** One .syx in the local Presets/ folder — decoded summary from the server's mtime-keyed scan cache. */
export interface LocalPresetEntry {
  path: string; // relative to Presets/, '/'-separated
  name: string;
  size: number;
  mtime: number;
  summary: PresetSummary;
}
export interface LocalSyncResult {
  ok: boolean;
  written: number;
  skippedExisting: number;
  total: number;
  backups: number;
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
  | { type: 'blockState'; effectId?: number }
  | { type: 'changed'; scope: 'grid' | 'preset' }
  // A shared Axis config doc (layouts / swipe quick-actions / tags / surface arrange …) was written by
  // another UI — apply it live so both directions stay in sync without a reload. `origin` = the writer's
  // client id, so a UI ignores its own echo.
  | { type: 'config'; id: string; data: unknown; origin?: string }
  // Device-telemetry control (META-17): the active polling mode changed server-side (another UI / a PUT
  // elsewhere), and cumulative traffic counters for the live traffic monitor. `traffic` carries the
  // TrafficSnapshot fields inline.
  | { type: 'telemetryConfig'; mode: TelemetryMode }
  | ({ type: 'traffic' } & TrafficSnapshot)
  // Device-definitions build progress (A4 · META-22): streamed while a self-describe walk builds the
  // per-firmware definition profile. `building` flips false on completion/cancel/error.
  | { type: 'cacheBuild'; phase: 'walking' | 'building' | 'done' | 'error' | 'cancelled' | 'already-built'; done: number; total: number; key?: string; model?: number; firmware?: string; error?: string };

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
  /** Device server exposes the telemetry polling-mode control (GET/PUT /telemetry/config). Absent on
   *  older servers → the polling-mode UI (AxisPanel Performance tab + workbench telemetry widget) is hidden. */
  telemetryControl?: boolean;
  /** Rail-screen virtual effects this device exposes (Setup/Controllers/Modifier/FC …). */
  virtualEffects?: { eid: number; slug: string; name: string }[];
  // ── device-definitions / self-describe (A4, AXIS-17/44 · META-22) ──
  /** Device can self-describe its effect definitions by reading them off the unit (the "live walk"),
   *  so Axis can build a per-firmware definition profile instead of shipping bundled ones. Absent on
   *  older servers → the device-definitions prompt never appears (bundled definitions keep working). */
  selfDescribe?: boolean;
  /** Server accepts importing an official editor `effectDefinitions_*.cache` file (POST
   *  /device/cache/import). Absent → the import affordances are hidden. */
  cacheImport?: boolean;
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

// ── Device definitions / effect-definition profile cache (A4, AXIS-17/44 · META-22) ──
// Axis normally ships BUNDLED effect definitions. When the connected device+firmware has no persisted
// profile, it can build one — by reading the definitions off the device (self-describe "live walk"),
// importing an official editor `effectDefinitions_*.cache`, or pulling a shared profile from the cloud.
// All of these route through ONE server-side cache, described by the shapes below.

/** Where the currently-active definition profile came from. `bundled` = Axis's shipped definitions
 *  (no device profile persisted); the others = a built/imported/pulled profile. `origin` on the meta is
 *  optional server detail; when absent but a profile exists we surface a generic "device profile". */
export type DeviceDefsOrigin = 'bundled' | 'device' | 'editorCache' | 'cloud';

/** Metadata about a built/imported definition profile (`GET /device/cache` → `meta`). */
export interface DeviceCacheMeta {
  recordCount: number;
  builtAt: string | null;
  /** Firmware the profile was built against (e.g. "12.0"). */
  firmware?: string | null;
  /** Sections/families the walk couldn't map — a coverage hint (0 = full coverage). */
  unmappedSections?: number;
  unmappedFamilies?: number;
  /** How the profile was obtained: 'live' = A3 self-describe walk, 'editor-cache' = imported official
   *  editor file, 'cloud' = pulled shared profile. Absent on servers that don't stamp it. */
  source?: 'live' | 'editor-cache' | 'cloud' | (string & {});
}

/** POST /device/cache/import and /device/cache/cloud/pull success body. */
export interface DeviceCacheImportResult {
  ok: boolean;
  imported?: boolean;
  pulled?: boolean;
  key: string;
  model: number;
  firmware: string;
  source: string;
  recordCount?: number;
  contentHash?: string;
}

/** GET /device/cache — status of the per-device definition profile. 404/501 → capability absent. */
export interface DeviceCacheStatus {
  /** Opaque cache key (model+firmware) the server addresses this profile by. */
  key: string;
  /** A persisted profile exists for the connected device+firmware. */
  exists: boolean;
  /** A build is currently running. */
  building: boolean;
  progress?: { done: number; total: number; phase: string };
  meta?: DeviceCacheMeta;
}

/** One editor-cache file discovered on disk (Node/Electron) — GET /device/cache/sources → candidates. */
export interface DeviceCacheCandidate {
  path: string;
  file: string;
  /** Model byte parsed from the filename (e.g. 0x15 = 21). */
  model: number;
  fwMajor: number;
  fwMinor: number;
  size: number;
  mtime: number;
}

/** GET /device/cache/sources — discovered import candidates + whether a profile is already persisted.
 *  Browser sessions get no filesystem discovery (`discovery: 'unavailable'`, empty candidates). */
export interface DeviceCacheSources {
  persisted: boolean;
  candidates: DeviceCacheCandidate[];
  discovery?: 'unavailable';
}

/** GET /device/cache/cloud — whether a shared cloud profile exists for this device+firmware.
 *  `enabled:false` = the server has no cloud configured at all (AXIS_CLOUD off). */
export interface CloudCacheStatus {
  enabled?: boolean;
  available: boolean;
  meta?: { source?: string; recordCount?: number | null; createdAt?: string; contentHash?: string };
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

/** GET /blocks/:slug/types — one selectable type/model for a block family. */
export interface BlockTypeOption {
  value: number;
  name: string;
  manufacturer: string | null;
  basedOn: string | null;
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
  /** ADDITIVE (API v2): how the grid was read. Currently always 'dump' (whole-preset read). */
  source?: 'dump';
}

// ── Cross-device preset converter (P4a · META-24 · AXIS-47/48) ──
// POST /api/preset/convert — port a preset to another Fractal device, best-effort, with a per-decision
// event log. The server (ForgeFX → forgefx-midi) does the actual conversion; Axis only renders the diff.
// This is the FIXED wire contract — mirror it exactly; do not author conversion logic here.

/** The seven devices a preset can be converted TO (the converter's target ids — distinct from the
 *  connection-picker `ProfileKey`). */
export type ConverterDeviceId =
  | 'axe-fx-iii'
  | 'fm9'
  | 'fm3'
  | 'vp4'
  | 'am4'
  | 'axe-fx-ii'
  | 'axe-fx-gen1';

/** One decision the converter made, as a discriminated union on `kind`. Severity is derived
 *  client-side (see convertReport.ts `eventSeverity`) — the API returns raw events. */
export type ConversionEvent =
  /** The source preset could only be decoded to `decodeDepth` (e.g. name-scan only). */
  | { kind: 'source-partial'; decodeDepth: string; detail: string }
  /** A whole block couldn't be carried over. */
  | { kind: 'block-dropped'; blockKey: string; family: string; reason: 'family-missing' | 'capacity-exceeded' | 'instance-limit' }
  /** A block converted but couldn't be placed on the target grid. */
  | { kind: 'block-unplaced'; blockKey: string; family: string; reason: string }
  /** A block's model/type was mapped to a different target type. */
  | { kind: 'type-substituted'; blockKey: string; family: string; sourceTypeName: string; targetTypeName: string; confidence: 'exact' | 'lineage' | 'fuzzy' | 'fallback'; score?: number }
  /** A block's source type had no match on the target (kept a default). */
  | { kind: 'type-unresolved'; blockKey: string; family: string; sourceTypeName: string }
  /** A parameter value was clamped to the target's range. */
  | { kind: 'param-clamped'; blockKey: string; nativeName: string; conceptKey?: string; sourceValue: number; targetValue: number; targetMin?: number; targetMax?: number }
  /** A parameter couldn't be mapped and was dropped. */
  | { kind: 'param-dropped'; blockKey: string; nativeName: string; reason: 'no-concept-mapping' | 'target-lacks-param' }
  /** A parameter was carried over but its mapping isn't verified. */
  | { kind: 'param-unverified'; blockKey: string; nativeName: string; value: number }
  /** The routing/grid had to be simplified. */
  | { kind: 'routing-simplified'; detail: string; affectedBlockKeys: string[] }
  /** A block folded into another block on the target (e.g. cab → the AM4 amp's integrated cab). Info,
   *  not a loss — the function survives inside the host block. */
  | { kind: 'block-merged'; blockKey: string; family: string; intoFamily: string; intoBlockKey?: string }
  /** The target has fewer scenes than the source. */
  | { kind: 'scene-collapsed'; sourceScenes: number; targetScenes: number }
  /** A block's channels were collapsed to fit the target. */
  | { kind: 'channel-collapsed'; blockKey: string; sourceChannels: number; targetChannels: number };

/** Every discriminant of {@link ConversionEvent}. */
export type ConversionEventKind = ConversionEvent['kind'];

/** One converted parameter on a target block. Extra keys are tolerated (server may add detail). */
export interface ConverterParam {
  nativeName: string;
  conceptKey?: string;
  value: number;
  [k: string]: unknown;
}

/** One block in the converted (target) preset. */
export interface ConverterBlock {
  key: string;
  family: string;
  instance: number;
  typeName?: string;
  typeValue?: number;
  params: ConverterParam[];
  channels?: number;
  bypassPerScene?: boolean[];
  // Grid targets carry {row,col}; slot/chain targets (AM4/VP4) carry {slot}; a bare number is a legacy
  // slot index. null / omitted = unplaced (the editor's tray).
  position?: { row: number; col: number } | { slot: number } | number | null;
}

/** The converted preset's routing. `gridCells` is device-specific (opaque here); `seriesChains`
 *  is the linear fallback chain of block keys. */
export interface ConverterRouting {
  gridCells?: unknown;
  seriesChains: string[][];
}

/** The converted (target) preset IR — the P4b fake-grid consumes this. */
export interface ConverterPreset {
  sourceDevice: string;
  name: string;
  sceneNames?: string[];
  sceneCount: number;
  blocks: ConverterBlock[];
  routing: ConverterRouting;
  decodeDepth: string;
  meta?: Record<string, unknown>;
}

/** Event tally by severity (the summary chips). */
export interface ConversionSummary {
  total: number;
  info: number;
  warn: number;
  loss: number;
}

/** POST /api/preset/convert → 200 body. */
export interface ConvertResponse {
  source: { device: string; name: string; decodeDepth: string };
  target: ConverterPreset;
  /** ADDITIVE: the fully-decoded SOURCE preset (blocks + routing.gridCells for gen-3 sources), rendered
   *  read-only as a reference + drag source next to the converted target grid. Optional so a legacy
   *  server that omits it degrades gracefully (the source panel shows an empty-state hint). */
  sourcePreset?: ConverterPreset;
  events: ConversionEvent[];
  summary: ConversionSummary;
}

/** One block (and its written params/type) that landed in an authored export. */
export interface ConvertExportBlockRecord {
  blockKey: string;
  family: string;
  displayName: string;
  instance: number;
  eid: number;
  /** Type ordinal written (absent when no type was written). */
  typeWritten?: number;
  params: { paramId: number; nativeName?: string; channel: number; raw: number }[];
}

/** One IR block/param the author could not place onto the base and skipped (never synthesized). */
export interface ConvertExportSkip {
  blockKey?: string;
  family?: string;
  paramId?: number;
  nativeName?: string;
  reason: string;
}

/** POST /api/preset/convert/export → 200 body. FM3-only offline `.syx` authoring: the converted preset
 *  is written onto a caller-supplied FM3 BASE template. `syx` is FILE-level valid only (valid CRC, decodes
 *  back to the written values) — NOT a proof of device acceptance; a hardware load test on a real FM3 is
 *  still required before trusting an authored preset. */
export interface ConvertExportResponse {
  /** Authored FM3 preset `.syx` bytes. */
  syx: number[];
  /** Blocks (and their params/type) that landed in the output. */
  written: ConvertExportBlockRecord[];
  /** IR blocks/params that had no base match and were skipped. */
  skipped: ConvertExportSkip[];
  /** The preset name written into the header. */
  name: string;
  /** END-TO-END VALIDATION GATE result for the authored output, decoded back with the codec. On a 200 this
   *  is always `ok:true` — a failing authored preset is refused server-side (422) and never returned. */
  validation: { ok: boolean; issues: string[] };
  /** Edit-in-place FIDELITY: how many converted source blocks LANDED vs were DROPPED because the base
   *  template lacked a matching block. `droppedForNoBaseBlock > 0` ⇒ warn the user their base is too thin. */
  fidelity: { sourceBlocks: number; landedBlocks: number; droppedForNoBaseBlock: number };
}

// connection picker (serial + MIDI ports)
export type ConnPick = { transport: 'serial' | 'midi'; id: string; inId?: string; outId?: string };
/** Manual device-profile override (Axis "Connection & Device"). 'auto' = detect. */
export type ProfileKey = 'auto' | 'fm3' | 'fm9' | 'axe3' | 'am4' | 'axe2' | 'vp4' | 'gen1';
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
