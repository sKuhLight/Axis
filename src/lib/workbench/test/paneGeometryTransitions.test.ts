import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Design-runtime rule: pane geometry (left/top/width/height) must never be CSS-transitioned.
// A ResizeObserver re-render loop restarts geometry transitions and panes get stuck mid-flight.
// Opacity/color transitions are fine.
const DOCK_COMPONENTS = [
  'src/lib/workbench/svelte/DockWorkspace.svelte',
  'src/lib/workbench/svelte/DockRegion.svelte',
  'src/lib/workbench/svelte/DockNode.svelte',
  'src/lib/workbench/svelte/TabStack.svelte',
  'src/lib/workbench/svelte/PanelHost.svelte',
  'src/lib/workbench/svelte/SplitHandle.svelte'
];

const GEOMETRY_PROPS = /\b(left|top|width|height|inset|flex-basis|transform)\b/;

function transitionValues(source: string): string[] {
  const values: string[] = [];
  const declaration = /transition(?:-property)?\s*:\s*([^;]+);/g;
  for (const match of source.matchAll(declaration)) values.push(match[1].trim());
  return values;
}

describe('dock pane geometry transitions', () => {
  it('never transitions pane geometry in dock components', () => {
    const offenders = DOCK_COMPONENTS.flatMap((relative) => {
      const source = readFileSync(join(process.cwd(), relative), 'utf8');
      return transitionValues(source)
        .filter((value) => value.includes('all') || GEOMETRY_PROPS.test(value))
        .map((value) => ({ file: relative, value }));
    });

    expect(offenders).toEqual([]);
  });
});
