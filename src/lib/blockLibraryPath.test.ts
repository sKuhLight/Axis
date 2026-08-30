import { describe, expect, it } from 'vitest';
import { defaultBlockLibraryPath } from './blockLibraryPath';

describe('defaultBlockLibraryPath', () => {
  it.each([
    ['FM3', '~/Documents/Fractal Audio/FM3-Edit/blocks'],
    ['FM9', '~/Documents/Fractal Audio/FM9-Edit/blocks'],
    ['Axe-Fx III', '~/Documents/Fractal Audio/Axe-Edit III/blocks'],
    ['axe fx iii', '~/Documents/Fractal Audio/Axe-Edit III/blocks']
  ])('maps %s to its Fractal Edit blocks folder', (unit, path) => {
    expect(defaultBlockLibraryPath(unit)).toBe(path);
  });

  it('has no default without a supported detected unit', () => {
    expect(defaultBlockLibraryPath(null)).toBeNull();
    expect(defaultBlockLibraryPath('VP4')).toBeNull();
  });
});
