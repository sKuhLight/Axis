/**
 * Click-to-place (pure, unit-tested): after a card is picked in the Add
 * palette, every valid drop spot lights up and a click on one inserts there.
 * Technically a drag without a pressed button — the pointer hovers, the SAME
 * target / landing logic as a drag (`dockDropTarget.ts`, the widget zone
 * insert, nav gaps) previews the result, and the click is the drop. The DOM
 * glue lives in `placementSession.ts`.
 *
 * This module holds the parts that need no DOM: the highlight spots derived
 * from measured geometry, the keyboard state machine (Tab / Shift+Tab across
 * spots, arrows pick a stack zone or a widget insert position, Enter places,
 * Escape cancels) and the edit-bar status line.
 */
import type { DockRegionId } from '../core';
import { rectContainsPointer, type WorkbenchPointer, type WorkbenchRect } from './drag';
import {
  landingRect,
  regionBandRect,
  type DockDropGeometry,
  type DockDropTarget,
  type DockZone
} from './dockDropTarget';

export type PlacementKind = 'panel' | 'widget' | 'page';

/** One highlight: a stack, a dock edge, a widget zone, or a navigation gap. */
export interface PlacementSpot {
  id: string;
  kind: 'stack' | 'edge' | 'zone' | 'nav';
  /** The highlighted rect (client px). */
  rect: WorkbenchRect;
  /** Short name of the spot ("Signal Grid", "Dock left", "Top right"). */
  label: string;
  /** `stack`: the stack, its region and whether it only offers "Add as tab". */
  stackId?: string;
  targetPanelId?: string;
  region?: DockRegionId;
  small?: boolean;
  /** `edge`: the region is empty (the panel becomes its first stack). */
  empty?: boolean;
  /** `zone`: the widget zone and its unit count (insert index range 0..units). */
  zone?: string;
  units?: number;
  /** `nav`: the gap index among the measured (on-screen) navigation entries. */
  gap?: number;
  /** `nav`: the entry right after the gap (absent past the last one). */
  navBefore?: string;
  /** `nav`: the entry right before the gap (absent before the first one). */
  navAfter?: string;
  orientation?: 'horizontal' | 'vertical';
}

/** Transient controller state while placing (never persisted). */
export interface WorkbenchPlacementState {
  kind: PlacementKind;
  /** What is being placed ("Preset Browser"). */
  label: string;
  spots: PlacementSpot[];
  /** The spot the keyboard (or the pointer) is on, by id. */
  activeSpotId: string | null;
  /** Keyboard: the zone chosen on a stack spot. */
  zone: DockZone;
  /** Keyboard: the insert position on a widget-zone spot (unit index). */
  insert: number | null;
}

export const PLACEMENT_HINT = 'Click a highlight to place · Esc cancels';
/** The hint once a spot is active (pointer or keyboard). */
export const PLACEMENT_ACTIVE_HINT = 'Click or Enter places · Esc cancels';
export const PLACEMENT_CANCELLED_TOAST = 'Placement cancelled';

/**
 * The edit bar's status line while placing (a `role="status"` live region):
 * "<Name> · Click a highlight to place · Esc cancels", and once a spot is
 * active "<Name> → <where> · Click or Enter places · Esc cancels".
 */
export function placementStatusText(label: string, active?: string | null): string {
  return active ? `${label} → ${active} · ${PLACEMENT_ACTIVE_HINT}` : `${label} · ${PLACEMENT_HINT}`;
}

/**
 * Where the active spot places it, in words (null = no active spot): the
 * highlight label for the zone chosen on a stack, a widget zone with the
 * keyboard insert position, a navigation gap.
 */
export function placementActiveDescription(state: Pick<WorkbenchPlacementState, 'spots' | 'activeSpotId' | 'zone' | 'insert'>): string | null {
  const spot = state.activeSpotId ? state.spots.find((candidate) => candidate.id === state.activeSpotId) : undefined;
  if (!spot) return null;
  if (spot.kind === 'zone' && state.insert != null) {
    const units = spot.units ?? 0;
    const at = Math.max(0, Math.min(units, state.insert));
    if (!units) return spot.label;
    return `${spot.label}, ${at === 0 ? 'at the start' : at >= units ? 'at the end' : `position ${at + 1} of ${units + 1}`}`;
  }
  return describeSpot(spot, state.zone);
}

const REGION_ORDER: readonly DockRegionId[] = ['main', 'left', 'right', 'top', 'bottom'];
const EDGE_REGIONS: readonly DockRegionId[] = ['left', 'right', 'top', 'bottom'];

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * The panel highlights for a measured dock: every stack (main first, then the
 * side regions, each in DOM order), then the four dock edges — an empty
 * region's strip, or the outer band of an occupied region — and an empty main.
 */
export function panelPlacementSpots(geometry: DockDropGeometry): PlacementSpot[] {
  const spots: PlacementSpot[] = [];
  const stacks = [...geometry.stacks]
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => REGION_ORDER.indexOf(a.slot.region) - REGION_ORDER.indexOf(b.slot.region) || a.index - b.index)
    .map(({ slot }) => slot);
  for (const slot of stacks) {
    spots.push({
      id: `stack:${slot.stackId}`,
      kind: 'stack',
      rect: { ...slot.rect },
      label: slot.title ?? slot.activePanelId,
      stackId: slot.stackId,
      targetPanelId: slot.activePanelId,
      region: slot.region,
      small: slot.collapsed || slot.rect.width < 200 || slot.rect.height < 150
    });
  }
  const occupied = new Set(geometry.occupiedRegions ?? geometry.stacks.map((slot) => slot.region));
  for (const region of EDGE_REGIONS) {
    const empty = !occupied.has(region);
    const strip = [...geometry.emptyRegions, ...(geometry.collapsedRegions ?? [])].find((candidate) => candidate.region === region)?.rect;
    const target: DockDropTarget = { kind: 'edge', region, empty };
    const rect = strip ?? landingRect(target, geometry) ?? regionBandRect(region, geometry);
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    spots.push({ id: `edge:${region}`, kind: 'edge', rect: { ...rect }, label: `Dock ${region}`, region, empty });
  }
  const main = geometry.emptyRegions.find((candidate) => candidate.region === 'main');
  if (main) spots.push({ id: 'edge:main', kind: 'edge', rect: { ...main.rect }, label: 'Main region', region: 'main', empty: true });
  return spots;
}

/** The dock drop target a keyboard-chosen spot (+ zone on a stack) stands for. */
export function spotDockTarget(spot: PlacementSpot, zone: DockZone = 'center'): DockDropTarget | null {
  if (spot.kind === 'stack' && spot.stackId && spot.targetPanelId && spot.region) {
    const base = { stackId: spot.stackId, targetPanelId: spot.targetPanelId, region: spot.region };
    return spot.small ? { kind: 'zone', ...base, zone: 'center', small: true } : { kind: 'zone', ...base, zone, small: false };
  }
  if (spot.kind === 'edge' && spot.region) return { kind: 'edge', region: spot.region, empty: !!spot.empty };
  return null;
}

/** The spot a dock drop target belongs to (pointer hover → highlighted spot). */
export function spotIdForDockTarget(target: DockDropTarget | null): string | null {
  if (!target) return null;
  if (target.kind === 'zone' || target.kind === 'tab') return `stack:${target.stackId}`;
  if (target.kind === 'edge') return `edge:${target.region}`;
  return null;
}

/** Widget highlights: one per measured zone, insertion at its end by default. */
export function widgetPlacementSpots(zones: ReadonlyArray<{ zone: string; rect: WorkbenchRect; units: number; label: string }>): PlacementSpot[] {
  return zones
    .filter((zone) => zone.rect.width > 0 && zone.rect.height > 0)
    .map((zone) => ({ id: `zone:${zone.zone}`, kind: 'zone' as const, rect: { ...zone.rect }, label: zone.label, zone: zone.zone, units: zone.units }));
}

/** Thickness (px) of a navigation gap highlight. */
export const NAV_GAP_THICKNESS = 4;

/**
 * Which way the navigation runs, from the measured entries: a row when they
 * spread further sideways than down (the bottom nav, a phone side mode laid out
 * as a row), else a column; a single entry follows its container's shape.
 */
export function navOrientation(entries: ReadonlyArray<WorkbenchRect>, container: WorkbenchRect): 'vertical' | 'horizontal' {
  if (entries.length < 2) return container.width > container.height ? 'horizontal' : 'vertical';
  const xs = entries.map((rect) => rect.left + rect.width / 2);
  const ys = entries.map((rect) => rect.top + rect.height / 2);
  const spreadX = Math.max(...xs) - Math.min(...xs);
  const spreadY = Math.max(...ys) - Math.min(...ys);
  return spreadX > spreadY ? 'horizontal' : 'vertical';
}

/** A measured navigation entry: its id (`data-nav-entry`) and rect. */
export interface MeasuredNavEntry {
  id: string;
  rect: WorkbenchRect;
}

/**
 * Navigation gap highlights: before each measured entry and after the last one.
 * A vertical list (side rail) gets horizontal lines between entries, a
 * horizontal one (bottom nav) vertical lines. Each gap carries its neighbours'
 * ids (`navBefore` / `navAfter`), so it maps onto `navigation.order` by id —
 * whatever is scrolled away or not rendered.
 */
export function navPlacementSpots(entries: ReadonlyArray<MeasuredNavEntry>, container: WorkbenchRect, orientation: 'vertical' | 'horizontal'): PlacementSpot[] {
  if (!entries.length) return [];
  const spots: PlacementSpot[] = [];
  const t = NAV_GAP_THICKNESS;
  for (let gap = 0; gap <= entries.length; gap++) {
    const prev = entries[gap - 1]?.rect;
    const next = entries[gap]?.rect;
    let rect: WorkbenchRect;
    if (orientation === 'vertical') {
      const y = prev && next ? (prev.top + prev.height + next.top) / 2 : next ? next.top - 3 : prev.top + prev.height + 3;
      rect = { left: container.left + 4, top: y - t / 2, width: Math.max(0, container.width - 8), height: t };
    } else {
      const x = prev && next ? (prev.left + prev.width + next.left) / 2 : next ? next.left - 3 : prev.left + prev.width + 3;
      rect = { left: x - t / 2, top: container.top + 4, width: t, height: Math.max(0, container.height - 8) };
    }
    spots.push({
      id: `nav:${gap}`,
      kind: 'nav',
      rect,
      label: gap === entries.length ? 'End of navigation' : `Navigation position ${gap + 1}`,
      gap,
      ...(entries[gap] ? { navBefore: entries[gap].id } : {}),
      ...(entries[gap - 1] ? { navAfter: entries[gap - 1].id } : {}),
      orientation
    });
  }
  return spots;
}

/** The navigation gap nearest the pointer, when the pointer is over the navigation (± `slack` px). */
export function navGapAt(spots: readonly PlacementSpot[], container: WorkbenchRect, pointer: WorkbenchPointer, slack = 12): PlacementSpot | null {
  const area = { left: container.left - slack, top: container.top - slack, width: container.width + 2 * slack, height: container.height + 2 * slack };
  if (!spots.length || !rectContainsPointer(area, pointer)) return null;
  let best: PlacementSpot | null = null;
  let bestDistance = Infinity;
  for (const spot of spots) {
    if (spot.kind !== 'nav') continue;
    const distance =
      spot.orientation === 'horizontal'
        ? Math.abs(pointer.x - (spot.rect.left + spot.rect.width / 2))
        : Math.abs(pointer.y - (spot.rect.top + spot.rect.height / 2));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = spot;
    }
  }
  return best;
}

// ── Keyboard ─────────────────────────────────────────────────────────────────

/** Tab / Shift+Tab: the next spot index, wrapping; from "none" Tab starts at the first, Shift+Tab at the last. */
export function nextSpotIndex(count: number, current: number | null, backwards: boolean): number | null {
  if (count <= 0) return null;
  if (current == null || current < 0 || current >= count) return backwards ? count - 1 : 0;
  return (current + (backwards ? count - 1 : 1)) % count;
}

/**
 * Arrow keys on a stack spot walk a cross of zones: from the centre an arrow
 * picks that side's split; the opposite arrow comes back to the centre ("Add
 * as tab"); the same arrow again stays.
 */
export function stepStackZone(zone: DockZone, key: string): DockZone {
  const side: Record<string, DockZone> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom' };
  const opposite: Record<DockZone, DockZone> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top', center: 'center' };
  const wanted = side[key];
  if (!wanted) return zone;
  if (zone === 'center') return wanted;
  if (wanted === opposite[zone]) return 'center';
  return wanted;
}

export type PlacementKeyAction =
  | { type: 'focus'; spotId: string; zone: DockZone; insert: number | null }
  | { type: 'zone'; zone: DockZone }
  | { type: 'insert'; insert: number }
  | { type: 'commit' }
  | { type: 'cancel' }
  | null;

/**
 * What a key does while placing (null = not ours, let it through):
 *   - Escape cancels;
 *   - Tab / Shift+Tab move across the spots (zone resets to the centre, a widget
 *     zone's insert to its end);
 *   - arrows: on a stack walk the zone cross, on a widget zone move the insert
 *     position (←/↑ earlier, →/↓ later), on navigation gaps move to the
 *     neighbouring gap;
 *   - Enter / Space: place on the active spot, or — nothing active yet — focus the first one.
 */
export function placementKeyAction(state: WorkbenchPlacementState, key: string, shift: boolean): PlacementKeyAction {
  const { spots } = state;
  const index = state.activeSpotId ? spots.findIndex((spot) => spot.id === state.activeSpotId) : -1;
  const active = index >= 0 ? spots[index] : undefined;
  const focusAt = (at: number | null): PlacementKeyAction => {
    if (at == null) return null;
    const spot = spots[at];
    return { type: 'focus', spotId: spot.id, zone: 'center', insert: spot.kind === 'zone' ? (spot.units ?? 0) : null };
  };
  switch (key) {
    case 'Escape':
      return { type: 'cancel' };
    case 'Tab':
      return focusAt(nextSpotIndex(spots.length, index >= 0 ? index : null, shift));
    case 'Enter':
    case ' ':
      if (active) return { type: 'commit' };
      return focusAt(nextSpotIndex(spots.length, null, false));
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown': {
      if (!active) return focusAt(nextSpotIndex(spots.length, null, key === 'ArrowLeft' || key === 'ArrowUp'));
      if (active.kind === 'stack') return active.small ? null : { type: 'zone', zone: stepStackZone(state.zone, key) };
      const later = key === 'ArrowRight' || key === 'ArrowDown';
      if (active.kind === 'zone') {
        const units = active.units ?? 0;
        const current = state.insert ?? units;
        return { type: 'insert', insert: Math.max(0, Math.min(units, current + (later ? 1 : -1))) };
      }
      if (active.kind === 'nav') {
        const navSpots = spots.filter((spot) => spot.kind === 'nav');
        const at = navSpots.findIndex((spot) => spot.id === active.id) + (later ? 1 : -1);
        const next = navSpots[Math.max(0, Math.min(navSpots.length - 1, at))];
        return { type: 'focus', spotId: next.id, zone: 'center', insert: null };
      }
      return null;
    }
    default:
      return null;
  }
}

/** Apply a key action to the state (pure); `commit` / `cancel` / null leave it unchanged. */
export function applyPlacementKey(state: WorkbenchPlacementState, action: PlacementKeyAction): WorkbenchPlacementState {
  if (!action) return state;
  switch (action.type) {
    case 'focus':
      return { ...state, activeSpotId: action.spotId, zone: action.zone, insert: action.insert };
    case 'zone':
      return { ...state, zone: action.zone };
    case 'insert':
      return { ...state, insert: action.insert };
    default:
      return state;
  }
}

/** Centre of a rect (the synthetic pointer a keyboard-chosen spot previews at). */
export function rectCenter(rect: WorkbenchRect): WorkbenchPointer {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** A spot's highlight label for the keyboard state: "Split right · Signal Grid". */
export function describeSpot(spot: PlacementSpot, zone: DockZone = 'center'): string {
  if (spot.kind === 'stack') {
    if (spot.small || zone === 'center') return `Add as tab · ${spot.label}`;
    return `Split ${zone} · ${spot.label}`;
  }
  if (spot.kind === 'edge') return spot.region === 'main' ? 'Main region' : `${capitalize(spot.region ?? '')} edge`;
  return spot.label;
}
