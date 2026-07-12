// Filters-block model for the docked Preset Browser (V13e): the builder-chips row and its pickers.
//
// Ported from src/lib/PresetBrowser.svelte (`pickerItems`, `pickerPick`, `editConds`, `addCondPayload`,
// the chip anatomy `opGlyph`/block-head/param-pill). Pure logic: given the derived filter specs + the
// tag list, it produces the picker item lists (addfilter → tag/name/scenes/cpu/block → param → value),
// and the condition-list mutations each pick applies. The Svelte panel renders the popover + chips and
// routes edits through the controller; all the model lives here so it is unit tested.

import { axisPbCatColor, axisPbCatLabel } from './presetBrowserWorkbenchRowChips';
import {
  filterableSlugs,
  specFor,
  usableSpecs,
  type AxisPbFilterSpec,
  type SpecLibEntry
} from './presetBrowserWorkbenchSpecs';
import type { AxisPbCond, AxisPbParamCond } from './presetBrowserWorkbenchQuery';

export type AxisPbPickerKind = 'addfilter' | 'tag' | 'param' | 'value';

export interface AxisPbPickerCtx {
  block?: string;
  param?: string;
  /** Index of the target block chip in the condition list (for `+ param` on an existing chip). */
  ci?: number;
}

export interface AxisPbPickerItem {
  /** The value passed back to `applyPick`. */
  v: string;
  label: string;
  sub: string;
  dot: boolean;
  color: string;
}

export interface AxisPbFiltersContext {
  slugs: string[];
  specs: Record<string, Map<string, AxisPbFilterSpec>>;
  tags: string[];
}

export function buildFiltersContext(entries: SpecLibEntry[], specs: Record<string, Map<string, AxisPbFilterSpec>>, tags: string[]): AxisPbFiltersContext {
  return { slugs: filterableSlugs(entries), specs, tags };
}

// The picker item list for a kind + search fragment (verbatim from monolith `pickerItems`).
export function pickerItems(ctx: AxisPbFiltersContext, kind: AxisPbPickerKind, pctx: AxisPbPickerCtx, search: string): AxisPbPickerItem[] {
  const f = search.toLowerCase();
  if (kind === 'addfilter') {
    const items: AxisPbPickerItem[] = ctx.slugs.map((id) => ({ v: id, label: id.toUpperCase(), sub: 'block', dot: true, color: axisPbCatColor(id) }));
    items.push({ v: 'tag', label: 'tag:', sub: 'by tag', dot: false, color: '#6e6e78' });
    items.push({ v: 'name', label: 'name:', sub: 'name contains', dot: false, color: '#6e6e78' });
    items.push({ v: 'scenes', label: 'scenes', sub: 'scene count', dot: false, color: '#6e6e78' });
    items.push({ v: 'cpu', label: 'cpu', sub: 'est. CPU load', dot: false, color: '#6e6e78' });
    return items.filter((i) => i.label.toLowerCase().includes(f) || i.sub.includes(f));
  }
  if (kind === 'tag') {
    return ctx.tags.filter((t) => t.toLowerCase().includes(f)).map((t) => ({ v: t, label: t, sub: '', dot: true, color: '#6e6e78' }));
  }
  if (kind === 'param') {
    const id = pctx.block!;
    return usableSpecs(ctx.specs, id)
      .filter((s) => s.label.toLowerCase().includes(f))
      .map((s) => ({ v: s.label, label: s.label, sub: s.kind === 'enum' ? 'type' : 'num', dot: false, color: '#6e6e78' }));
  }
  if (kind === 'value') {
    const spec = specFor(ctx.specs, pctx.block!, pctx.param!);
    if (!spec) return [];
    if (spec.kind === 'enum') {
      return [...spec.enums].filter((v) => v.toLowerCase().includes(f)).map((v) => ({ v, label: v, sub: '', dot: true, color: axisPbCatColor(pctx.block!) }));
    }
    const lo = spec.min;
    const hi = spec.max;
    const mids = [lo, (lo + hi) / 2, hi].map((x) => Math.round(x * 10) / 10);
    return [...new Set(mids)].filter((v) => String(v).includes(f)).map((v) => ({ v: String(v), label: String(v), sub: 'value', dot: false, color: '#6e6e78' }));
  }
  return [];
}

// The outcome of picking an item: either a chain to another picker, or a condition-list mutation.
export type AxisPbPickResult =
  | { type: 'chain'; kind: AxisPbPickerKind; ctx: AxisPbPickerCtx }
  | { type: 'edit'; edit: (conds: AxisPbCond[]) => void }
  | { type: 'close' };

// Resolve a pick to an outcome (verbatim from monolith `pickerPick`). The caller applies `edit` through
// `editConds` (advanced → re-serialize to query text; simple → set conditions) and opens chained pickers.
export function applyPick(ctx: AxisPbFiltersContext, kind: AxisPbPickerKind, pctx: AxisPbPickerCtx, v: string): AxisPbPickResult {
  if (kind === 'addfilter') {
    if (v === 'tag') return { type: 'chain', kind: 'tag', ctx: {} };
    if (v === 'name') return { type: 'edit', edit: (c) => c.push({ kind: 'name', val: '' }) };
    if (v === 'scenes') return { type: 'edit', edit: (c) => c.push({ kind: 'scenes', op: '>', val: '4' }) };
    if (v === 'cpu') return { type: 'edit', edit: (c) => c.push({ kind: 'cpu', op: '<', val: '60' }) };
    return { type: 'edit', edit: (c) => c.push({ kind: 'block', block: v as never, params: [] }) };
  }
  if (kind === 'tag') {
    return { type: 'edit', edit: (c) => { if (!c.some((x) => x.kind === 'tag' && x.val === v)) c.push({ kind: 'tag', val: v }); } };
  }
  if (kind === 'param') {
    const spec = specFor(ctx.specs, pctx.block!, v);
    if (!spec) return { type: 'close' };
    return { type: 'chain', kind: 'value', ctx: { block: pctx.block, param: v, ci: pctx.ci } };
  }
  if (kind === 'value') {
    const op = specFor(ctx.specs, pctx.block!, pctx.param!)?.kind === 'num' ? '>' : '=';
    return {
      type: 'edit',
      edit: (c) => {
        const target =
          pctx.ci != null && c[pctx.ci]?.kind === 'block'
            ? (c[pctx.ci] as Extract<AxisPbCond, { kind: 'block' }>)
            : ([...c].reverse().find((x) => x.kind === 'block' && x.block === pctx.block) as Extract<AxisPbCond, { kind: 'block' }> | undefined);
        if (target) target.params.push({ name: pctx.param!, op, val: v });
      }
    };
  }
  return { type: 'close' };
}

// Add a block/param condition from a drag payload or double-click (verbatim from monolith `addCondPayload`).
// Finds the last block chip for that slug (or creates one), then appends the param cond if given.
export interface AxisPbDragPayload {
  slug: string;
  label?: string;
  op?: string;
  val?: string;
}

export function addCondFromPayload(conds: AxisPbCond[], p: AxisPbDragPayload): void {
  if (!p.slug) return;
  let blk = [...conds].reverse().find((x) => x.kind === 'block' && x.block === p.slug) as
    | Extract<AxisPbCond, { kind: 'block' }>
    | undefined;
  if (!blk) {
    blk = { kind: 'block', block: p.slug as never, params: [] };
    conds.push(blk);
  }
  if (p.label && p.op && p.val != null && !blk.params.some((q) => q.name === p.label && q.val === p.val)) {
    blk.params.push({ name: p.label, op: p.op, val: p.val });
  }
}

// Friendlier operator glyphs in chips (verbatim from monolith `opGlyph`). Typed language still uses >=,<=,!=.
export function opGlyph(op: string): string {
  return ({ '>=': '≥', '<=': '≤', '!=': '≠' } as Record<string, string>)[op] ?? op;
}

// Stable hash → hue tag color (verbatim from monolith `tagColor`), used for tag chip dots.
export function tagColor(t: string): string {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 60%)`;
}

export type AxisPbChipDescriptor =
  | { kind: 'block'; block: string; color: string; label: string; params: { name: string; op: string; val: string; glyph: string }[] }
  | { kind: 'scalar'; color: string; text: string };

// Turn a condition into the chip descriptor the FILTERS row renders (mirrors the monolith chip template).
export function chipDescriptor(c: AxisPbCond): AxisPbChipDescriptor {
  if (c.kind === 'block') {
    return {
      kind: 'block',
      block: c.block,
      color: axisPbCatColor(c.block),
      label: axisPbCatLabel(c.block),
      params: c.params.map((p: AxisPbParamCond) => ({ name: p.name, op: p.op, val: p.val, glyph: opGlyph(p.op) }))
    };
  }
  if (c.kind === 'tag') return { kind: 'scalar', color: tagColor(c.val), text: `Tag: ${c.val}` };
  if (c.kind === 'name') return { kind: 'scalar', color: '#9a9aa3', text: `Name: ${c.val}` };
  if (c.kind === 'author') return { kind: 'scalar', color: '#9a9aa3', text: `Author: ${c.val}` };
  if (c.kind === 'scenes') return { kind: 'scalar', color: '#4f6bed', text: `Scenes ${opGlyph(c.op)} ${c.val}` };
  return { kind: 'scalar', color: '#f5a623', text: `~CPU ${opGlyph(c.op)} ${c.val}` };
}
