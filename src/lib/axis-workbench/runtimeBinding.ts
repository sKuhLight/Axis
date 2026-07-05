export interface AxisRuntimeBindable<Host, Snapshot> {
  bindHost(host: Host | null): () => void;
  subscribe(run: (snapshot: Snapshot) => void): () => void;
}

export interface AxisRuntimeBindingOptions<Host, Snapshot> {
  runtime: AxisRuntimeBindable<Host, Snapshot>;
  host: Host;
  onSnapshot: (snapshot: Snapshot) => void;
  start?: () => void | Promise<void>;
}

export function bindAxisRuntimeHost<Host, Snapshot>(options: AxisRuntimeBindingOptions<Host, Snapshot>): () => void {
  const unbindHost = options.runtime.bindHost(options.host);
  const unsubscribe = options.runtime.subscribe(options.onSnapshot);
  void options.start?.();

  return () => {
    unsubscribe();
    unbindHost();
  };
}
