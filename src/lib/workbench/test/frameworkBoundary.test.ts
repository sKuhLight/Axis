import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKBENCH_ROOT = join(process.cwd(), 'src/lib/workbench');
const PRODUCTION_EXTENSIONS = new Set(['.ts', '.svelte']);
const FORBIDDEN_PATTERNS = [
  /axis-workbench/,
  /axis-safe/,
  /axis\./,
  /editor\.svelte/,
  /forgefx/,
  /history\.svelte/,
  /SignalGrid\.svelte/,
  /BlockEditor\.svelte/,
  /PresetBrowser\.svelte/
];

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot);
}

function productionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === 'test') return [];
      return productionFiles(path);
    }
    return PRODUCTION_EXTENSIONS.has(extensionOf(path)) ? [path] : [];
  });
}

describe('workbench framework boundary', () => {
  it('keeps production Workbench code free of Axis-specific strings and imports', () => {
    const offenders = productionFiles(WORKBENCH_ROOT).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return FORBIDDEN_PATTERNS.filter((pattern) => pattern.test(source)).map((pattern) => ({
        file: file.replace(`${process.cwd()}/`, ''),
        pattern: pattern.source
      }));
    });

    expect(offenders).toEqual([]);
  });
});
