export type AxisFcSide = 'tap' | 'hold';

export interface AxisFcSlotLike {
  i: number;
  role: string;
  type: string;
  min?: number;
  max?: number;
  options?: string[];
}

export interface AxisFcFunctionLike {
  ord: number;
  name: string;
  slots: AxisFcSlotLike[];
  labels?: string[];
}

export interface AxisFcModelLike {
  effectId: number;
  paramsWidth: number;
  configs: number;
  liveState: boolean;
  switches?: number;
  views?: number;
  layouts?: number;
  configsPerLayout?: number;
  labelLen?: number;
  fields?: Record<string, { base?: number; width?: number; stride?: number; pid?: number } | undefined>;
  categories?: Record<string, string>;
  labelModes?: Record<string, string>;
  colors?: Record<string, { name: string; hex: string }>;
  functions?: Record<string, AxisFcFunctionLike[]>;
  channels?: string[];
}

export interface AxisFcLayoutSummary {
  index: number;
  label: string;
  active: boolean;
}

export interface AxisFcViewSummary {
  index: number;
  label: string;
  active: boolean;
}

export interface AxisFcSwitchSummary {
  index: number;
  label: string;
  config: number;
  active: boolean;
}

export interface AxisFcConfigSummary {
  index: number;
  label: string;
  active: boolean;
}

export interface AxisFcSideSummary {
  side: AxisFcSide;
  label: string;
  categoryCount: number;
  functionCount: number;
  slotCount: number;
  labelModeCount: number;
}

export interface AxisFcDataView {
  ready: boolean;
  mode: 'live' | 'geometry' | 'flat';
  hasGeometry: boolean;
  effectId: number | null;
  selectedLayout: number;
  selectedView: number;
  selectedSwitch: number | null;
  selectedSide: AxisFcSide;
  selectedConfig: number;
  layouts: AxisFcLayoutSummary[];
  views: AxisFcViewSummary[];
  switches: AxisFcSwitchSummary[];
  configs: AxisFcConfigSummary[];
  sides: AxisFcSideSummary[];
  colors: { value: number; name: string; hex: string }[];
  labelModes: string[];
  note: string;
}

export interface AxisFcDataInput {
  model: AxisFcModelLike | null;
  layout: number;
  view: number;
  switchIndex: number | null;
  side: AxisFcSide;
}

export function axisFcLayoutLabel(index: number): string {
  return index === 8 ? 'Master' : String(index + 1);
}

export function createAxisFcDataView(input: AxisFcDataInput): AxisFcDataView {
  const model = input.model;
  if (!model) {
    return {
      ready: false,
      mode: 'flat',
      hasGeometry: false,
      effectId: null,
      selectedLayout: Math.max(0, Math.floor(input.layout)),
      selectedView: Math.max(0, Math.floor(input.view)),
      selectedSwitch: input.switchIndex,
      selectedSide: input.side,
      selectedConfig: 0,
      layouts: [],
      views: [],
      switches: [],
      configs: [],
      sides: [],
      colors: [],
      labelModes: [],
      note: 'Loading Foot Controller model.'
    };
  }

  const hasGeometry = !!(model.layouts && model.configsPerLayout && model.switches);
  const mode: AxisFcDataView['mode'] = model.liveState ? 'live' : hasGeometry ? 'geometry' : 'flat';
  const layoutCount = hasGeometry ? model.layouts! : 0;
  const viewCount = model.views ?? 1;
  const switchCount = hasGeometry || model.liveState ? (model.switches ?? 3) : 0;
  const selectedLayout = clampInt(input.layout, 0, Math.max(0, layoutCount - 1));
  const selectedView = clampInt(input.view, 0, Math.max(0, viewCount - 1));
  const selectedSwitch = switchCount > 0
    ? clampInt(input.switchIndex ?? 0, 0, Math.max(0, switchCount - 1))
    : null;
  const selectedConfig = hasGeometry || model.liveState
    ? selectedLayout * (model.configsPerLayout ?? 0) + selectedView * (model.switches ?? 0) + (selectedSwitch ?? 0)
    : clampInt(input.switchIndex ?? 0, 0, Math.max(0, model.configs - 1));

  return {
    ready: true,
    mode,
    hasGeometry,
    effectId: model.effectId,
    selectedLayout,
    selectedView,
    selectedSwitch,
    selectedSide: input.side,
    selectedConfig,
    layouts: Array.from({ length: layoutCount }, (_, index) => ({
      index,
      label: axisFcLayoutLabel(index),
      active: index === selectedLayout
    })),
    views: Array.from({ length: viewCount }, (_, index) => ({
      index,
      label: String(index + 1),
      active: index === selectedView
    })),
    switches: Array.from({ length: switchCount }, (_, index) => ({
      index,
      label: String(index + 1),
      config: hasGeometry || model.liveState
        ? selectedLayout * (model.configsPerLayout ?? 0) + selectedView * (model.switches ?? 0) + index
        : index,
      active: index === selectedSwitch
    })),
    configs: Array.from({ length: model.configs }, (_, index) => ({
      index,
      label: String(index),
      active: index === selectedConfig
    })),
    sides: (['tap', 'hold'] as const).map((side) => ({
      side,
      label: side.toUpperCase(),
      categoryCount: Object.keys(model.categories ?? {}).length,
      functionCount: Object.values(model.functions ?? {}).reduce((sum, functions) => sum + functions.length, 0),
      slotCount: model.fields?.[`${side}Params`]?.width ?? model.paramsWidth ?? 0,
      labelModeCount: Object.keys(model.labelModes ?? {}).length
    })),
    colors: Object.entries(model.colors ?? {})
      .map(([value, color]) => ({ value: Number(value), name: color.name, hex: color.hex }))
      .sort((a, b) => a.value - b.value),
    labelModes: Object.entries(model.labelModes ?? {})
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, label]) => label),
    note: noteForMode(mode)
  };
}

function clampInt(value: number, min: number, max: number): number {
  const next = Math.max(min, Math.floor(Number.isFinite(value) ? value : min));
  return max < min ? min : Math.min(next, max);
}

function noteForMode(mode: AxisFcDataView['mode']): string {
  if (mode === 'live') return 'Live FC model with layout, view, switch, side, label, and LED metadata.';
  if (mode === 'geometry') return 'Geometry FC model without live read-back; edits are blind writes in the full editor.';
  return 'Flat FC config model; no layout/switch geometry has been decoded for this device.';
}
