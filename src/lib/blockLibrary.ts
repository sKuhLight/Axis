import { z } from 'zod';
import { isForeignControl } from './deviceLayoutBoard';
import type { BlockParams } from './types';

export const BLOCK_LIBRARY_KEY = 'axs.blockLibrary.v1';
export const BLOCK_LIBRARY_NAME_LIMIT = 64;
const ENTRY_LIMIT = 100;
const TYPE = z.object({ value: z.number().int().nonnegative(), name: z.string().min(1) });
const PARAMETER = z.discriminatedUnion('continuous', [
  z.object({ id: z.number().int().nonnegative(), name: z.string(), value: z.number().min(0).max(1), continuous: z.literal(true) }),
  z.object({ id: z.number().int().nonnegative(), name: z.string(), value: z.number().int(), continuous: z.literal(false) })
]);
const ENTRY = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(BLOCK_LIBRARY_NAME_LIMIT),
  model: z.number().int(),
  firmware: z.string().min(1),
  family: z.string().min(1),
  type: TYPE.nullable(),
  parameters: z.array(PARAMETER).max(1024)
});

export type BlockLibraryEntry = z.infer<typeof ENTRY>;
export type LibraryParameter = z.infer<typeof PARAMETER>;
export type BlockLibraryProfile = Pick<BlockLibraryEntry, 'model' | 'firmware' | 'family'>;
export type BlockLibraryMode = 'browse' | 'save';
export interface BlockLibraryTarget extends BlockLibraryProfile {
  key: string;
  effectId: number;
  channel: string | null;
  preset: number;
  display: string;
}

/** A damaged entry should not hide the remaining library. */
export function readBlockLibrary(storage: Pick<Storage, 'getItem'>): BlockLibraryEntry[] {
  try {
    const saved: unknown = JSON.parse(storage.getItem(BLOCK_LIBRARY_KEY) ?? '[]');
    if (!Array.isArray(saved)) return [];
    const ids = new Set<string>();
    return saved.slice(0, ENTRY_LIMIT).flatMap((value) => {
      const parsed = ENTRY.safeParse(value);
      if (!parsed.success || ids.has(parsed.data.id)) return [];
      ids.add(parsed.data.id);
      return [parsed.data];
    });
  } catch {
    return [];
  }
}

export function putBlockLibraryEntry(storage: Pick<Storage, 'getItem' | 'setItem'>, entry: BlockLibraryEntry): void {
  const current = readBlockLibrary(storage);
  if (current.length >= ENTRY_LIMIT) throw new Error('The block library is full. Remove an entry before saving another.');
  storage.setItem(BLOCK_LIBRARY_KEY, JSON.stringify([ENTRY.parse(entry), ...current]));
}

export function removeBlockLibraryEntry(storage: Pick<Storage, 'getItem' | 'setItem'>, id: string): void {
  storage.setItem(BLOCK_LIBRARY_KEY, JSON.stringify(readBlockLibrary(storage).filter((entry) => entry.id !== id)));
}

export function compatibleLibraryEntry(entry: BlockLibraryProfile, target: BlockLibraryProfile): boolean {
  return entry.model === target.model && entry.firmware === target.firmware && entry.family === target.family;
}

/** Capture only editable values of the active channel. Header state and readouts belong to the preset/device. */
export function libraryParameters(response: BlockParams, effectId: number): LibraryParameter[] {
  const excluded = new Set([
    response.blockState?.bypassMode?.paramId,
    response.blockState?.sceneIgnore?.paramId
  ]);
  const owner = { family: response.layout?.family, effectId };
  for (const page of response.layout?.pages ?? []) {
    const controls = [...(page.pageControls ?? []), ...page.rows.flatMap((row) => row.controls ?? [])];
    for (const ctl of controls) {
      if ((ctl.widget === 'meter' || ctl.widget === 'readout') && !isForeignControl(ctl, owner)) {
        excluded.add(ctl.paramId ?? undefined);
      }
    }
  }
  const eligible = (id: number | undefined, name: string) =>
    id != null && !excluded.has(id) && !/^(type|bypass)$/i.test(name.trim());
  const values = new Map<number, LibraryParameter>();
  for (const e of response.enums ?? []) {
    if (eligible(e.id, e.name) && e.options.some((option) => option.value === e.value)) {
      values.set(e.id, { id: e.id, name: e.name, value: e.value, continuous: false });
    }
  }
  for (const p of response.named) {
    if (p.id == null || !eligible(p.id, p.name) || values.has(p.id)) continue;
    if (p.norm != null && Number.isFinite(p.norm) && p.norm >= 0 && p.norm <= 1) {
      values.set(p.id, { id: p.id, name: p.name, value: p.norm, continuous: true });
    }
  }
  return [...values.values()];
}

/** Match IDs and kinds against the device's current, type-specific layout before writing. */
export function planLibraryWrites(entry: BlockLibraryEntry, block: BlockParams, effectId: number): LibraryParameter[] {
  const current = new Map(libraryParameters(block, effectId).map((value) => [value.id, value]));
  const enums = new Map((block.enums ?? []).map((value) => [value.id, value]));
  const ids = new Set<number>();
  return entry.parameters.filter((saved) => {
    const target = current.get(saved.id);
    if (ids.has(saved.id) || target?.continuous !== saved.continuous || target.name !== saved.name ||
        (!saved.continuous && !enums.get(saved.id)?.options.some((option) => option.value === saved.value))) {
      throw new Error(`"${saved.name}" is incompatible with the current block definitions.`);
    }
    ids.add(saved.id);
    return Math.abs(target.value - saved.value) > (saved.continuous ? 0.0001 : 0);
  });
}
