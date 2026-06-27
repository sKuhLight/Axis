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
  name: string;
  value: number;
  unit?: string;
  norm?: number;
}

export interface BlockParams {
  block: string;
  slug?: string;
  page: number;
  named: NamedParam[];
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
