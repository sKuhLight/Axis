import { describe, it, expect, vi } from 'vitest';

// The real editor store (`editor.svelte.ts`) instantiates a runes singleton (`new EditorStore()`) at
// module load, executing `$state(...)`. This unit harness is node-env with no Svelte compiler (see
// vitest.config.ts), so loading the real module throws `$state is not defined`. Mock it with a sentinel
// — the seam contract under test is purely that getEditorSurface() falls back to the module's exported
// `editor` singleton when no Svelte context is active.
const { editorSingleton } = vi.hoisted(() => ({ editorSingleton: { __editorSingleton: true } }));
vi.mock('./editor.svelte', () => ({ editor: editorSingleton }));

import { getEditorSurface } from './editorSurface';
import { editor } from './editor.svelte';

describe('getEditorSurface', () => {
  it('falls back to the editor singleton when no context is set', () => {
    // Called outside any Svelte component → hasContext throws / returns false → the resolver returns the
    // device-backed singleton, preserving the pre-seam behaviour of a direct `import { editor }`.
    const surface = getEditorSurface();
    expect(surface).toBe(editorSingleton);
    expect(surface).toBe(editor);
  });
});
