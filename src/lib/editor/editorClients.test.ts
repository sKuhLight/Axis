import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = join(process.cwd(), 'src');
const ALLOWED_DIRECT_IMPORTS = new Set([
  'src/lib/editor/editorClients.svelte.ts',
  'src/lib/editor/editorSurface.ts'
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(svelte|ts)$/.test(entry) && !/\.(?:runes\.)?test\.ts$/.test(entry)
        ? [path]
        : [];
  });
}

describe('editor client boundaries', () => {
  it('keeps production clients off the editor facade', () => {
    const offenders = sourceFiles(SOURCE_ROOT)
      .filter((file) => !ALLOWED_DIRECT_IMPORTS.has(file.slice(process.cwd().length + 1)))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return /(?:from\s+|import\()['"][^'"]*editor\/editor\.svelte['"]/.test(source)
          || /(?:from\s+|import\()['"]\.\/editor\.svelte['"]/.test(source);
      })
      .map((file) => file.slice(process.cwd().length + 1));

    expect(offenders).toEqual([]);
  });
});
