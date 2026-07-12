import { describe, expect, it } from 'vitest';
import { bindAxisRuntimeHost, type AxisRuntimeBindable } from '../runtimeBinding';

describe('Axis runtime binding helper', () => {
  it('binds host, subscribes snapshots, starts runtime work, and cleans up in reverse', () => {
    const calls: string[] = [];
    const runtime: AxisRuntimeBindable<{ id: string }, { value: number }> = {
      bindHost: (host) => {
        calls.push(`bind:${host?.id ?? 'none'}`);
        return () => calls.push('unbind');
      },
      subscribe: (run) => {
        calls.push('subscribe');
        run({ value: 1 });
        return () => calls.push('unsubscribe');
      }
    };
    const seen: number[] = [];

    const cleanup = bindAxisRuntimeHost({
      runtime,
      host: { id: 'host' },
      onSnapshot: (snapshot) => seen.push(snapshot.value),
      start: () => { calls.push('start'); }
    });

    cleanup();

    expect(seen).toEqual([1]);
    expect(calls).toEqual(['bind:host', 'subscribe', 'start', 'unsubscribe', 'unbind']);
  });
});
