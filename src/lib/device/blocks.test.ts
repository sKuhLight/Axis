import { describe, it, expect } from 'vitest';
import { baseName, instanceOf, showInstance } from './blocks';

describe('instanceOf', () => {
  it('reads the trailing instance digit', () => {
    expect(instanceOf('Output 2')).toBe('2');
    expect(instanceOf('Compressor 10')).toBe('10');
  });

  it('is empty for an unnumbered display', () => {
    expect(instanceOf('Output')).toBe('');
    expect(instanceOf('Brit 800 Mod')).toBe('');
  });
});

describe('showInstance', () => {
  it('always numbers Input and Output, even a lone instance', () => {
    expect(showInstance('Output', 'Output 1', 1)).toBe('1');
    expect(showInstance('Output', 'Output 2', 2)).toBe('2');
    expect(showInstance('Input', 'Input 1', 1)).toBe('1');
  });

  it('hides the first instance of a lone family', () => {
    expect(showInstance('Drive', 'Drive 1', 1)).toBe('');
    expect(showInstance('Amp', 'Amp 1', 1)).toBe('');
  });

  it('shows the first instance when a sibling exists', () => {
    expect(showInstance('Drive', 'Drive 1', 2)).toBe('1');
    expect(showInstance('Drive', 'Drive 2', 2)).toBe('2');
  });

  it('shows a non-first instance even without siblings', () => {
    expect(showInstance('Cab', 'Cab 2', 1)).toBe('2');
  });

  it('stays empty when the display carries no number', () => {
    expect(showInstance('Output', 'Output', 1)).toBe('');
  });
});

describe('baseName', () => {
  it('strips the trailing instance digit only', () => {
    expect(baseName('Parametric EQ 1')).toBe('Parametric EQ');
    expect(baseName('Brit 800 Mod')).toBe('Brit 800 Mod');
    expect(baseName('Output')).toBe('Output');
  });
});
