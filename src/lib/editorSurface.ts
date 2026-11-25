// Data-source SEAM for the editor-backed grid components (SignalGrid /
// BlockEditor / BeSurface / EQGraph / CabPicker). Today every one of them resolves
// the live device-backed `editor` singleton; this indirection lets a later milestone drive
// them from an OFFLINE buffer (an alternative EditorSurface set into Svelte context) without
// touching the components. With no provider set, getEditorSurface() falls back to the singleton
// → behaviourally identical to a direct `import { editor }`.
//
// EditorSurface is the exact subset of the EditorStore that those six components read/call
// (plus cabState, routed off the direct forgefx client). The compile-time guard at the bottom
// of editor.svelte.ts (`_editorSatisfiesSurface`) forces the singleton to satisfy this shape.
import { getContext, hasContext } from 'svelte';
import { editor } from './editor.svelte';
import type { Cell, Layout } from './grid';
import type { NamedParam, EnumParam, DetectResult, DeviceLayout, LiveMonitor, CabState, BlockState, BlockVisual } from './types';
import type { SwipeCtrl } from './layouts';
import type { BlockLibraryMode, BlockLibraryTarget } from './blockLibrary';

export const EDITOR_SURFACE_KEY = Symbol('axis.editorSurface');

export interface EditorSurface {
  // ── grid reads ──
  layout: Layout;
  status: 'loading' | 'ready' | 'offline';
  readonly shuntBase: number;
  readonly canGridRoute: boolean;

  // ── selection / editor state ──
  selKey: string | null;
  readonly selected: Cell | null;
  editorOpen: boolean;
  editorH: number;
  sheetState: 'loading' | 'ready' | 'error' | 'nopack';
  blockType: { value: number; name: string } | null;
  blockLayout: DeviceLayout | null;
  linkFrom: Cell | null;
  paletteMode: 'place' | 'retype';
  paletteOpen: boolean;
  placeTarget: { row: number; col: number } | null;
  cabPickerOpen: boolean;
  params: NamedParam[];
  enums: EnumParam[];

  // ── responsive / mobile grid ──
  readonly isMobile: boolean;
  vw: number;
  vh: number;
  mobCols: number;
  gridPage: number;
  readonly pageCount: number;
  changeCols: (d: number) => void;
  setCols: (n: number) => void;
  colsFit: () => void;
  changePage: (d: number) => void;
  setPage: (p: number) => void;

  // ── grid mutators / editor actions ──
  load: () => Promise<void>;
  openCell: (c: Cell) => Promise<void>;
  closeEditor: () => void;
  move: (src: Cell, row: number, col: number) => Promise<void>;
  removeAt: (row: number, col: number) => Promise<void>;
  removeSelected: () => Promise<void>;
  connect: (src: Cell, destRow: number, destCol: number) => Promise<void>;
  disconnect: (srcRow: number, srcCol: number, destRow: number) => Promise<void>;
  armLink: (c: Cell) => void;
  cancelLink: () => void;
  completeLink: (row: number, col: number) => Promise<void>;
  openPaletteAt: (row: number, col: number) => void;
  openRetype: () => void;
  readonly blockLibraryTarget?: BlockLibraryTarget | null;
  openBlockLibrary?: (mode: BlockLibraryMode) => void;
  openCabPicker: () => void;
  applyCab: (writes: { paramId: number; value: number }[]) => Promise<void>;
  toggleBypass: (cell?: Cell) => Promise<void>;
  setChannel: (ch: string) => Promise<void>;

  // ── block / params mutators (incl. device-only cabState, routed through the surface) ──
  setParam: (p: NamedParam, v: number) => void;
  setEnum: (e: EnumParam, value: number) => void;
  cabState: (eid: number) => Promise<CabState>;

  // ── block state (Scene Ignore / Bypass Mode of the open block: the Block Editor header) ──
  // Optional: a surface without them (an offline buffer) shows both controls disabled.
  /** caps.blockState of the device (undefined = the server does not say: an older ForgeFX). */
  readonly blockStateCap?: boolean;
  /** The open block's Scene Ignore + Bypass Mode, values live from `enums`; null when none was served. */
  readonly blockState?: BlockState | null;
  /** The block state was read on another channel than the active one (re-read pending): not writable. */
  readonly blockStateStale?: boolean;
  /** Write one of them (the enum write the board uses). */
  setBlockStateParam?: (paramId: number, value: number) => void;

  // ── read-only block visuals (the Block Editor's graph tiles) ──
  /** Tempo in bpm, and whether the device reports one (tempo-synced LFO rates; without it a synced LFO
   *  is drawn at its Rate value and says so). An offline buffer: 120 / false. */
  readonly bpm: number;
  readonly hasTempo: boolean;
  /** The open block's served graph displays (caps.blockVisuals); absent or empty = no graph tiles. */
  readonly blockVisuals?: readonly BlockVisual[];
  /** Live block metering is on (a dynamics graph shows its gain-reduction bar only then). */
  readonly meteringOn?: boolean;
  /** Meter role from the device's static monitor catalog. */
  readonly blockMonitorRole?: string;
  hasBlockMonitor?: (paramName: string) => boolean;
  /** Keep the selected block's live data running while a visible tile needs it. */
  observeBlockTelemetry?: (effectId: number, needs: { waveform: boolean; monitors: boolean }) => () => void;

  // ── telemetry / meters / swipe controls ──
  levels: { out1L: number; out1R: number; out2L: number; out2R: number } | null;
  readonly hasLooperWaveform?: boolean;
  looperWave: { wave: number[]; position: number | null; level: number | null } | null;
  looperControl: (action: string, on: boolean) => Promise<void>;
  typeNameFor: (effectId: number) => string;
  monitorFor: (effectId: number) => LiveMonitor | null;
  monitorsFor: (effectId: number) => LiveMonitor[];
  controlsFor: (cell: Cell) => SwipeCtrl[];
  meterFor: (cell: Cell) => {
    norm: number;
    value: number;
    unit?: string;
    min?: number;
    max?: number;
    log?: boolean;
    count: number;
    active: number;
    name: string;
  } | null;
  cycleControl: (cell: Cell, dir: number) => void;
  adjustSwipe: (cell: Cell, deltaNorm: number) => void;
  isSwipeControl: (paramId: number) => boolean;
  toggleSwipeControl: (p: NamedParam) => void;
  /** Swipe controls can be kept for the selected block (a live block family); without it a toggle does
   *  nothing. Absent = no. */
  readonly canSwipeControl?: boolean;

  // ── device-mirror ──
  detected: DetectResult | null;
  selectCellOnDevice: (row: number, col: number) => void;

  // ── hints / toasts ──
  hint: string | null;
  setHint: (text: string) => void;
  clearHint: () => void;
  showToast: (text: string, accent?: string) => void;
}

/** Resolve the active editor surface for the calling component: a context-provided surface
 *  (offline buffer, later milestone) when one is set, else the live device-backed singleton.
 *  Call once at component init (script top) — components mount inside a stable context.
 *  Defensive: Svelte's hasContext/getContext throw when called outside component init (e.g. a
 *  node unit test), so any failure falls back to the singleton — the pre-seam behaviour. */
export function getEditorSurface(): EditorSurface {
  try {
    if (hasContext(EDITOR_SURFACE_KEY)) return getContext<EditorSurface>(EDITOR_SURFACE_KEY);
  } catch {
    /* called outside a component context — use the live singleton */
  }
  return editor;
}
