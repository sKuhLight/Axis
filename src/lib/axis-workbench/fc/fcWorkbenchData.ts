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
  /** Any config in this layout is assigned (live read-back or a session edit). Drives the accent dot (04-fc-and-grid.md §3.2). */
  assigned: boolean;
}

export interface AxisFcViewSummary {
  index: number;
  label: string;
  active: boolean;
  /** Any switch of this view (in the selected layout) is assigned — accent dot per §3.1 view selector. */
  assigned: boolean;
}

export interface AxisFcSwitchSummary {
  index: number;
  label: string;
  config: number;
  active: boolean;
}

/** Board switch tile view model (04-fc-and-grid.md §3.1 tile anatomy). */
export interface AxisFcBoardTile {
  index: number;
  num: number;
  config: number;
  /** Big tile label: custom tap label else the tap auto-label else em-dash. */
  label: string;
  empty: boolean;
  active: boolean;
  /** Confirmed configured on the unit via live read-back. */
  onDevice: boolean;
  /** LED bar color: explicit color ordinal hex, else the tap category color, else null (empty). */
  ledHex: string | null;
  tapText: string;
  holdText: string;
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
  /** Device label derived from the model's switch count (design fcDevice ↔ connected-device mapping). */
  device: string;
  /** Header note per §3.1: "{n} switches · {device} · View {v}/{views}". */
  deviceNote: string;
  boardCols: number;
  boardMaxWidth: number;
  /** Board hero layout-name field text (§3.1); read-only in production (no rename in the device model). */
  layoutName: string;
  board: AxisFcBoardTile[];
}

export interface AxisFcDataInput {
  model: AxisFcModelLike | null;
  layout: number;
  view: number;
  switchIndex: number | null;
  side: AxisFcSide;
  /** Session edits + live read-back ordinals, keyed `${field}:${config}` (fcWorkbenchRuntime.edits). */
  edits?: Record<string, number>;
  /** Decoded label text keyed `${side}Label:${config}` (fcWorkbenchRuntime.labelText). */
  labelText?: Record<string, string>;
  /** Configured-on-unit flags per config (fcWorkbenchRuntime.present). */
  present?: Record<number, boolean>;
}

export function axisFcLayoutLabel(index: number): string {
  return index === 8 ? 'Master' : String(index + 1);
}

/**
 * Design fcDevice ↔ production mapping: the connected device's FC switch count decides the
 * device chip (design fcDeviceCount: FM3→3, FC-6→6, FC-12→12), 04-fc-and-grid.md §3.1/§5.
 */
export function axisFcDeviceForSwitchCount(count: number): string {
  return count >= 12 ? 'FC-12' : count >= 6 ? 'FC-6' : 'FM3';
}

/** Board grid columns per §3 data model: FM3→3, FC-6→3, FC-12→6. */
export function axisFcBoardCols(count: number): number {
  if (count >= 12) return 6;
  if (count >= 3) return 3;
  return Math.max(1, count);
}

// Design category palette (04-fc-and-grid.md §3 FC_CATS colors), matched against the
// device model's category *names* since production categories are capture-decoded strings.
const AXIS_FC_CATEGORY_COLORS: readonly [RegExp, string][] = [
  [/preset/i, '#f5a623'],
  [/scene/i, '#35c9d6'],
  [/bank/i, '#4f6bed'],
  [/block|effect/i, '#33c46b'],
  [/looper/i, '#e0556f'],
  [/tap/i, '#c084fc'],
  [/tuner/i, '#9aa0a6'],
  [/layout/i, '#46c2d6']
];

export function axisFcCategoryColor(name: string | undefined | null): string | null {
  if (!name || /unassigned|none/i.test(name)) return null;
  for (const [pattern, hex] of AXIS_FC_CATEGORY_COLORS) if (pattern.test(name)) return hex;
  return null;
}

/**
 * Auto label for one side of a switch (design fcAutoLabel/fcSummary, production-mapped:
 * category + function come from the model's decoded vocabularies via the edits ordinals).
 * Returns `fallback` ('—' for tile rows, 'Empty' for card summaries) when unassigned.
 */
export function axisFcActionLabel(
  model: AxisFcModelLike | null,
  side: AxisFcSide,
  config: number,
  edits: Record<string, number> | undefined,
  fallback = '—'
): string {
  const cat = edits?.[`${side}Category:${config}`];
  if (model == null || cat == null || cat === 0) return fallback;
  const catName = model.categories?.[String(cat)] ?? `Cat ${cat}`;
  const fnOrd = edits?.[`${side}Function:${config}`];
  const fn = fnOrd != null ? (model.functions?.[String(cat)] ?? []).find((f) => f.ord === fnOrd) : undefined;
  return fn ? `${catName} · ${fn.name}` : catName;
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
      note: 'Loading Foot Controller model.',
      device: 'FM3',
      deviceNote: '',
      boardCols: 3,
      boardMaxWidth: 620,
      layoutName: '',
      board: []
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

  const edits = input.edits ?? {};
  const labelText = input.labelText ?? {};
  const present = input.present ?? {};
  const configsPerLayout = model.configsPerLayout ?? 0;
  const configAssigned = (config: number): boolean =>
    !!present[config] ||
    (edits[`tapCategory:${config}`] ?? 0) !== 0 ||
    (edits[`holdCategory:${config}`] ?? 0) !== 0;
  const rangeAssigned = (start: number, length: number): boolean => {
    for (let config = start; config < start + length; config += 1) if (configAssigned(config)) return true;
    return false;
  };
  const device = axisFcDeviceForSwitchCount(switchCount);
  const boardCols = axisFcBoardCols(switchCount);
  const configFor = (switchIndex: number): number =>
    hasGeometry || model.liveState
      ? selectedLayout * configsPerLayout + selectedView * (model.switches ?? 0) + switchIndex
      : switchIndex;
  const board: AxisFcBoardTile[] = Array.from({ length: switchCount }, (_, index) => {
    const config = configFor(index);
    const tapText = axisFcActionLabel(model, 'tap', config, edits);
    const holdText = axisFcActionLabel(model, 'hold', config, edits);
    const customLabel = labelText[`tapLabel:${config}`] ?? '';
    const colorOrdinal = edits[`color:${config}`];
    const tapCatName = model.categories?.[String(edits[`tapCategory:${config}`] ?? 0)];
    const ledHex =
      (colorOrdinal != null ? model.colors?.[String(colorOrdinal)]?.hex : undefined) ??
      axisFcCategoryColor(tapCatName) ??
      null;
    return {
      index,
      num: index + 1,
      config,
      label: customLabel || tapText,
      empty: !configAssigned(config),
      active: index === selectedSwitch,
      onDevice: !!present[config],
      ledHex,
      tapText,
      holdText
    };
  });

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
      active: index === selectedLayout,
      assigned: rangeAssigned(index * configsPerLayout, configsPerLayout)
    })),
    views: Array.from({ length: viewCount }, (_, index) => ({
      index,
      label: String(index + 1),
      active: index === selectedView,
      assigned: rangeAssigned(selectedLayout * configsPerLayout + index * (model.switches ?? 0), model.switches ?? 0)
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
    note: noteForMode(mode),
    device,
    deviceNote: `${switchCount} switch${switchCount === 1 ? '' : 'es'} · ${device} · View ${selectedView + 1}/${Math.max(1, viewCount)}`,
    boardCols,
    boardMaxWidth: boardCols <= 3 ? 620 : 1060,
    layoutName: layoutCount > 0 ? (selectedLayout === 8 ? 'MASTER' : `LAYOUT ${selectedLayout + 1}`) : '',
    board
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
