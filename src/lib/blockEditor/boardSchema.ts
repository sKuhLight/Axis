// Zod schemas for everything the Block Editor persists: boards (v1 = previous editor, v2 = cell grid)
// and the per-block-family meta. Stored data is never trusted: a stored board is schema-checked here,
// then reconciled with `normalizeBoard`. The schema is deliberately forgiving where normalization can
// repair things (a bad `page`/`pageOrder` falls back to defaults, a single bad item is dropped, `null`
// in an optional field counts as absent); it rejects only what is not a board at all.

import { z } from 'zod';
import {
  BE_DIVIDER_KINDS,
  BE_VIEWS,
  isReservedPageName,
  migrateV1,
  type BeBoard,
  type BeBoardV1,
  type BeDividerKind,
  type BeItem,
  type BeView
} from './boardModel';
import type { SurfaceWidget } from '../deviceLayoutBoard';

const num = z.number();
/** Optional number that also tolerates `null` (stored as absent). */
const optNum = num.nullish().transform((v) => v ?? undefined);
/** Optional string that also tolerates `null`; any other bad value is dropped rather than failing. */
const optStr = z.string().nullish().catch(undefined).transform((v) => v ?? undefined);
/** Optional flag: `null` or any other bad value counts as absent instead of failing the whole object. */
const optFlag = z.boolean().nullish().catch(undefined).transform((v) => v ?? undefined);

// ── v1 (previous editor: no `v`, one control = one cell) ──
export const surfaceWidgetV1Schema = z.object({
  id: z.string(),
  key: z.string(),
  x: num,
  y: num,
  w: num,
  h: num,
  view: z.string(),
  row: optNum
});

// ── v2 ──
export const beControlSchema = z.object({
  id: z.string(),
  key: z.string(),
  view: z.enum(BE_VIEWS as [BeView, ...BeView[]]),
  x: num,
  y: num,
  w: num,
  h: num,
  row: optNum
});
export const beDividerSchema = z.object({
  id: z.string(),
  kind: z.enum(BE_DIVIDER_KINDS as [BeDividerKind, ...BeDividerKind[]]),
  x: num,
  y: num,
  w: num,
  h: num,
  label: optStr
});
// control first: an item with a `key` is a control even if it carries a stray `kind`
export const beItemSchema = z.union([beControlSchema, beDividerSchema]);

/** A list in which items that fail `item` are dropped instead of failing the whole board. */
const lenientList = <T>(item: z.ZodType<T>) =>
  z.array(z.unknown()).transform((arr) =>
    arr.flatMap((x) => {
      const r = item.safeParse(x);
      return r.success ? [r.data] : [];
    })
  );

/** Page → item list. Only own keys are read, `__proto__` is skipped, and a page whose list is not an
 *  array is dropped. The result is a plain object built key by key. */
const pagesOf = <T>(item: z.ZodType<T>) => {
  const list = lenientList(item);
  return z.custom<Record<string, unknown>>((v) => !!v && typeof v === 'object' && !Array.isArray(v)).transform((obj) => {
    const out: Record<string, T[]> = {};
    for (const k of Object.keys(obj)) {
      if (isReservedPageName(k)) continue;
      const r = list.safeParse(obj[k]);
      if (r.success) out[k] = r.data;
    }
    return out;
  });
};

const pageOrderSchema = z
  .array(z.unknown())
  .catch([])
  .transform((arr) => arr.filter((p): p is string => typeof p === 'string'));
const pageSchema = z.string().catch('');

export const beBoardV1Schema = z.object({
  pageOrder: pageOrderSchema,
  page: pageSchema,
  boards: pagesOf(surfaceWidgetV1Schema),
  variantSig: optStr
});

/** The fixed area: `null` or anything that is not one counts as absent (the board itself stays); a bad item
 *  in it is dropped. Its width is clamped by normalization. */
const fixedSchema = z
  .object({ cols: num, items: lenientList(beItemSchema) })
  .nullish()
  .catch(undefined)
  .transform((v) => v ?? undefined);

export const beBoardV2Schema = z.object({
  v: z.literal(2),
  pageOrder: pageOrderSchema,
  page: pageSchema,
  boards: pagesOf(beItemSchema),
  fixed: fixedSchema,
  variantSig: optStr
});

// ── meta (per block family) ──
export const bePrefsSchema = z.object({
  nav: z.enum(['top', 'side']),
  density: z.enum(['s', 'm', 'l'])
});
/** One device class's prefs: a broken entry is dropped (that class falls back to the defaults). */
const optPrefs = bePrefsSchema.nullish().catch(undefined).transform((v) => v ?? undefined);
// Forgiving below the required `active` / `names`: one bad optional field must not drop the whole meta,
// which would also forget `migrated` and re-open the previous editor's keys.
export const beMetaSchema = z.object({
  active: z.string().min(1),
  names: z.array(z.string()),
  prefs: z
    .object({
      desktop: optPrefs,
      tablet: optPrefs,
      phone: optPrefs
    })
    .nullish()
    .catch(undefined)
    .transform((v) => v ?? undefined),
  /** Set once the family's boards live under the new keys; legacy keys are not read after that. */
  migrated: optFlag,
  /** Arrange: every move / resize is followed by a gravity tidy ("Auto-pack"). */
  autoPack: optFlag
});
export type BePrefs = z.infer<typeof bePrefsSchema>;
export type BeMetaStored = z.infer<typeof beMetaSchema>;

function parseJson(json: unknown): unknown {
  if (typeof json !== 'string') return json;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

/** Parse a stored board (JSON text or an already parsed value) into a v2 board, migrating v1.
 *  Null for anything that is not a recognisable board. The result still needs `normalizeBoard`. */
export function parseStoredBoard(json: unknown): BeBoard | null {
  const raw = parseJson(json);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = (raw as { v?: unknown }).v;
  if (v === 2) {
    const r = beBoardV2Schema.safeParse(raw);
    if (!r.success) return null;
    const out: BeBoard = { v: 2, pageOrder: r.data.pageOrder, page: r.data.page, boards: r.data.boards as Record<string, BeItem[]> };
    if (r.data.fixed) out.fixed = { cols: r.data.fixed.cols, items: r.data.fixed.items as BeItem[] };
    if (r.data.variantSig != null) out.variantSig = r.data.variantSig;
    return out;
  }
  if (v !== undefined) return null; // an unknown future/foreign version
  const r = beBoardV1Schema.safeParse(raw);
  if (!r.success) return null;
  const v1: BeBoardV1 = { pageOrder: r.data.pageOrder, page: r.data.page, boards: r.data.boards as Record<string, SurfaceWidget[]> };
  if (r.data.variantSig != null) v1.variantSig = r.data.variantSig;
  return migrateV1(v1);
}

/** Parse stored meta (JSON text or a parsed value); null when it does not match. */
export function parseStoredMeta(json: unknown): BeMetaStored | null {
  const r = beMetaSchema.safeParse(parseJson(json));
  return r.success ? r.data : null;
}
