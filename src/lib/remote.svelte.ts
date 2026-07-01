// Axis Cloud Remote — remote-web bootstrap. In the remote build (axisapp.live), the app can't reach a
// local ForgeFX, so it signs the user into Supabase in the browser, joins their private Realtime channel,
// and installs the relay transport (setRemoteTransport). Once connected, the entire existing Axis UI runs
// unchanged — every /api call is routed to the user's PC. In the desktop build this is inert (active=false).
import { browserSupabase, isRemoteBuild, remoteConfigured } from './cloudBrowser';
import { connectRemote } from './remoteTransport';
import { setRemoteTransport } from './forgefx';

type Phase = 'signin' | 'connecting' | 'ready' | 'error';

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
      const { transport, close } = await connectRemote(sb, userId);
      setRemoteTransport(transport);
      this.#close = close;
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
