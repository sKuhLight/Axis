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
  page: number;
  named: NamedParam[];
}

export interface Firmware {
  version: string;
  build: string;
}

export interface Health {
  ok: boolean;
  device: string;
}
