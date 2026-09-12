// Tiny notifier so config/version mutations (in library/layouts/browser) can nudge a debounced
// auto-sync without an import cycle back to the editor. The editor registers the hook in init();
// mutation sites call notifyMutation(). No-op until a hook is registered.
let hook: (() => void) | null = null;

/** Register the auto-sync trigger (called once by the editor). */
export function onMutation(fn: () => void): void {
  hook = fn;
}

/** Signal that local config or version data changed — nudges the debounced sync if registered. */
export function notifyMutation(): void {
  hook?.();
}
