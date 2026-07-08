import { forgefx } from './forgefx';
import { idb } from './idb';

export type CabIrs = Record<string, string[]>;

const PREFIX = 'cab.irs.v1';

function validCatalog(v: unknown): v is CabIrs {
  return !!v && typeof v === 'object' && Object.values(v as Record<string, unknown>).every((x) => Array.isArray(x) && x.every((s) => typeof s === 'string'));
}

async function cacheKey(): Promise<string> {
  const d = await forgefx.device().catch(() => null);
  return `${PREFIX}:${d?.modelByte || d?.model || 'unknown'}`;
}

export async function cachedCabIrs(): Promise<CabIrs | null> {
  if (!idb.available()) return null;
  const v = await idb.get<unknown>(await cacheKey());
  return validCatalog(v) ? v : null;
}

export async function storeCabIrs(irs: CabIrs): Promise<void> {
  if (!idb.available()) return;
  await idb.set(await cacheKey(), irs);
}

export async function loadCabIrsCachedFirst(): Promise<CabIrs> {
  const cached = await cachedCabIrs();
  if (cached) return cached;
  const fresh = await forgefx.cabIrs();
  await storeCabIrs(fresh);
  return fresh;
}

export async function refreshCabIrsCache(): Promise<CabIrs> {
  const fresh = await forgefx.cabIrs({ refresh: true });
  await storeCabIrs(fresh);
  return fresh;
}
