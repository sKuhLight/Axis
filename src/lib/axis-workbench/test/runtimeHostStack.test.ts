import { describe, expect, it } from 'vitest';
import { createAxisRuntimeHostStack } from '../runtimeHostStack';

describe('Axis runtime host stack', () => {
  it('restores the previous host when the active pane unbinds', () => {
    const stack = createAxisRuntimeHostStack<{ id: string }>();
    const unbindA = stack.bind({ id: 'a' });
    const unbindB = stack.bind({ id: 'b' });

    expect(stack.current?.id).toBe('b');

    unbindB();
    expect(stack.current?.id).toBe('a');

    unbindA();
    expect(stack.current).toBeNull();
  });

  it('ignores duplicate unbinds and null hosts', () => {
    const stack = createAxisRuntimeHostStack<{ id: string }>();
    const unbindNull = stack.bind(null);
    const unbindA = stack.bind({ id: 'a' });

    unbindNull();
    expect(stack.current?.id).toBe('a');

    unbindA();
    unbindA();
    expect(stack.current).toBeNull();
  });
});
