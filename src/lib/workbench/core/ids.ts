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

const runtimeGenerator = createIdGenerator();

export const createWorkbenchId = (prefix: WorkbenchIdPrefix): string => runtimeGenerator.next(prefix);
