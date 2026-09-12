import { describe, expect, it } from 'vitest';
import { editor } from './editor.svelte';

const assignedMembers = [
  'axisOpen', 'themeOpen', 'paletteOpen', 'presetOpen', 'presetSearchOpen', 'cabPickerOpen',
  'deviceToolsOpen', 'quickBuildOpen', 'saveOpen', 'portsOpen', 'consentPromptOpen', 'drawerOpen',
  'editorH', 'meteringOn', 'virtual', 'bufferSource', 'reportPrompt', 'placeTarget', 'railActive',
  'presetPick', 'paletteMode', 'axisTab'
] as const;

function publicDescriptors(value: object): Map<string, PropertyDescriptor> {
  const descriptors = new Map<string, PropertyDescriptor>();
  for (let current: object | null = value; current && current !== Object.prototype; current = Object.getPrototypeOf(current)) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name === 'constructor' || name.startsWith('_') || descriptors.has(name)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (descriptor) descriptors.set(name, descriptor);
    }
  }
  return descriptors;
}

describe('EditorStore runtime facade', () => {
  it('preserves the deliberate public member surface', () => {
    // Unique names count getter/setter pairs once; update deliberately when the public surface changes.
    expect(publicDescriptors(editor).size).toBe(226);
  });

  it('keeps every externally assigned accessor writable', () => {
    const descriptors = publicDescriptors(editor);
    for (const name of assignedMembers) {
      const descriptor = descriptors.get(name);
      expect(descriptor, `${name} must remain public`).toBeDefined();
      if (descriptor?.get) expect(descriptor.set, `${name} lost its setter`).toBeTypeOf('function');
    }
  });

  it('round-trips every externally assigned member', () => {
    const surface = editor as unknown as Record<string, unknown>;
    for (const name of assignedMembers) {
      const original = surface[name];
      const alternate = typeof original === 'boolean' ? !original
        : typeof original === 'number' ? original + 1
          : typeof original === 'function' ? () => undefined
            : original === null ? {} : null;
      try {
        surface[name] = alternate;
        expect(surface[name], `${name} did not round-trip`).toEqual(alternate);
      } finally {
        surface[name] = original;
      }
    }
  });
});
