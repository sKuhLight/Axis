export type WorkbenchIdPrefix =
  | 'layout'
  | 'profile'
  | 'panel'
  | 'widget'
  | 'group'
  | 'tabs'
  | 'split'
  | 'template'
  | (string & {});

export interface WorkbenchIdGenerator {
  next(prefix: WorkbenchIdPrefix): string;
  snapshot(): Record<string, number>;
}

export interface IdGeneratorOptions {
  seed?: number;
  counters?: Record<string, number>;
}

const cleanPrefix = (prefix: string): string =>
  prefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'id';

export function createIdGenerator(options: IdGeneratorOptions = {}): WorkbenchIdGenerator {
  const counters: Record<string, number> = { ...(options.counters ?? {}) };
  const seed = options.seed ?? 0;

  return {
    next(prefix: WorkbenchIdPrefix): string {
      const key = cleanPrefix(prefix);
      counters[key] = (counters[key] ?? seed) + 1;
      return `${key}-${String(counters[key]).padStart(4, '0')}`;
    },
    snapshot(): Record<string, number> {
      return { ...counters };
    }
  };
}

const runtimeCounters: Record<string, number> = {};

// Matches ids minted by createIdGenerator (`tabs-0001`, `split-0012`, …).
const GENERATED_ID_PATTERN = /^([a-z0-9_-]+?)-(\d{4,})$/;

/**
 * Bump the session id counters past any generated-looking ids that already exist in a loaded
 * document, so `createWorkbenchId` never re-mints one of them. The runtime counters are
 * module-scoped and reset on every page load; without this, a persisted `tabs-0001` from a
 * previous session collides with the first stack created in the next one (duplicate keyed-each
 * ids crash the dock render).
 */
export function reserveWorkbenchIds(ids: Iterable<string>): void {
  for (const id of ids) {
    if (typeof id !== 'string') continue;
    const match = GENERATED_ID_PATTERN.exec(id);
    if (!match) continue;
    const key = match[1];
    const value = Number(match[2]);
    if (!Number.isFinite(value)) continue;
    if ((runtimeCounters[key] ?? 0) < value) runtimeCounters[key] = value;
  }
}

export const createWorkbenchId = (prefix: WorkbenchIdPrefix): string => {
  const key = cleanPrefix(prefix);
  runtimeCounters[key] = (runtimeCounters[key] ?? 0) + 1;
  return `${key}-${String(runtimeCounters[key]).padStart(4, '0')}`;
};
