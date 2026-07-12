export interface AxisRuntimeHostStack<T> {
  readonly current: T | null;
  bind(host: T | null): () => void;
}

export function createAxisRuntimeHostStack<T>(): AxisRuntimeHostStack<T> {
  let nextId = 1;
  const records: { id: number; host: T }[] = [];

  return {
    get current() {
      return records.at(-1)?.host ?? null;
    },
    bind(host: T | null): () => void {
      if (!host) return () => {};
      const id = nextId++;
      records.push({ id, host });
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const index = records.findIndex((record) => record.id === id);
        if (index >= 0) records.splice(index, 1);
      };
    }
  };
}
