// Axis Cloud Remote — remote-web bootstrap. In the remote build (axisapp.live), the app can't reach a
// local ForgeFX, so it signs the user into Supabase in the browser, joins their private Realtime channel,
// and installs the relay transport (setRemoteTransport). Once connected, the entire existing Axis UI runs
// unchanged — every /api call is routed to the user's PC. In the desktop build this is inert (active=false).
import { browserSupabase, isRemoteBuild, remoteConfigured } from './cloudBrowser';
import { connectRemote } from './remoteTransport';
import { setRemoteTransport, forgefx } from './forgefx';
import { editor } from './editor.svelte';
import { library } from './library.svelte';
import { surfInit } from './surfaceStore.svelte';
import type { DeviceEvent } from './types';

type Phase = 'signin' | 'connecting' | 'ready' | 'error';

/** Pull the user's Axis config from their PC (over the freshly-installed relay transport) so the remote UI
 *  mirrors the host exactly — same tags, collections, favorites, layouts, quick-actions (swipe) and preset
 *  library. These docs already sync to the cloud + live in the host's ForgeFX store; the remote just reads
 *  them. Layout/swipe/filter keys are written to localStorage BEFORE editor.init() so its loaders pick them
 *  up; tags/collections/favs + the preset index go straight into the library store. */
async function hydrateRemoteConfig(): Promise<void> {
  const get = async (id: string): Promise<unknown> => {
    try { return (await forgefx.getDoc<unknown>('config', id))?.data ?? null; } catch { return null; }
  };
  const [tags, collections, favs, savedFilters, layouts, swipe, index] = await Promise.all(
    ['tags', 'collections', 'favs', 'savedFilters', 'layouts', 'swipe', 'library'].map(get)
  );
  const put = (k: string, v: unknown) => { if (v != null) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } } };
  put('axis.layouts.v1', layouts);   // editor.init() → loadLayouts() reads this (block editor tab layouts)
  put('axis.swipe.v1', swipe);       // → loadSwipe() (the block quick-actions / swipe controls)
  put('axs.pb.saved', savedFilters); // Preset Browser saved filters
  await Promise.all([
    library.hydrate({ tags, collections, favs, index: index as { gz?: string } | null }),
    surfInit() // pull the control-surface boards/arrange/quick-actions (config/surface) from the host
  ]);
}

class RemoteBoot {
  /** True when this is the remote web app (VITE_AXIS_REMOTE=1), not the desktop build. */
  active = $state(isRemoteBuild());
  phase = $state<Phase>('signin');
  email = $state('');
  note = $state<string | null>(null);
  #close: (() => void) | null = null;

  /** On load, resume an existing session (skip sign-in if already logged in). */
  init = async () => {
    if (!this.active) return;
    if (!remoteConfigured()) { this.phase = 'error'; this.note = "This build isn't configured for remote access."; return; }
    try {
      const sb = await browserSupabase();
      const { data } = await sb.auth.getSession();
      if (data.session?.user) { this.email = data.session.user.email ?? ''; await this.#connect(data.session.user.id); }
    } catch { /* stay on the sign-in screen */ }
  };

  signIn = async (email: string, password: string) => {
    this.note = null;
    if (!email.trim() || !password) return;
    try {
      const sb = await browserSupabase();
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.user) { this.note = error?.message ?? 'Sign-in failed'; return; }
      this.email = data.user.email ?? '';
      await this.#connect(data.user.id);
    } catch (e) { this.note = (e as Error).message; }
  };

  #connect = async (userId: string) => {
    this.phase = 'connecting';
    this.note = null;
    try {
      const sb = await browserSupabase();
      // Private Realtime channels authorize via RLS against the JWT — make sure the socket carries the
      // user's access token before joining (a restored session may not have set it automatically).
      const { data: s } = await sb.auth.getSession();
      if (s.session?.access_token) { try { await sb.realtime.setAuth(s.session.access_token); } catch { /* */ } }
      const { transport, close } = await connectRemote(sb, userId, { onEvent: (e) => editor.applyDeviceEvent(e as DeviceEvent) });
      setRemoteTransport(transport);
      this.#close = close;
      // Now that the relay is live, pull the host's Axis config (tags/layouts/quick-actions/library) so the
      // remote matches the PC before the app starts. Best-effort — a failure here shouldn't block control.
      try { await hydrateRemoteConfig(); } catch { /* config pull failed — proceed with an empty local config */ }
      this.phase = 'ready';
    } catch (e) {
      this.phase = 'error';
      this.note = (e as Error).message;
    }
  };

  retry = () => { this.phase = 'signin'; this.note = null; };
  signOut = async () => {
    this.#close?.(); this.#close = null;
    setRemoteTransport(null);
    try { const sb = await browserSupabase(); await sb.auth.signOut(); } catch { /* */ }
    this.phase = 'signin';
    this.email = '';
  };
}

export const remoteBoot = new RemoteBoot();
