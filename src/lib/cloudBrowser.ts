// Browser Supabase client for Axis Cloud Remote (web build only). The desktop app authenticates via
// ForgeFX's server-side client (/cloud/*), but a remote browser has no local ForgeFX — it must talk to
// Supabase directly for auth + the Realtime channel. Config comes from build-time env (the anon key is
// publishable/client-safe; RLS protects the data). supabase-js is dynamic-imported so the desktop build
// never loads it.
import type { SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when this build is the web app (axisapp.live), not the local desktop app. (The env var name
 *  predates Browser Direct — the web build now hosts BOTH web modes; see webMode().) */
export const isRemoteBuild = (): boolean => import.meta.env.VITE_AXIS_REMOTE === '1';
export const remoteConfigured = (): boolean => !!URL && !!ANON;

/** Which web mode this page load runs: 'remote' relays to the user's PC (default — existing links and
 *  PWA installs keep working), 'direct' talks to the device from this browser over Web MIDI/Serial.
 *  Chosen per-load via ?mode=direct (the axisapp.live landing page's two launch buttons). */
export type WebMode = 'remote' | 'direct';
export function webMode(): WebMode {
  if (typeof location === 'undefined') return 'remote';
  return new URLSearchParams(location.search).get('mode') === 'direct' ? 'direct' : 'remote';
}

let client: SupabaseClient | null = null;
/** Lazily create the browser Supabase client (auth session persists in localStorage). */
export async function browserSupabase(): Promise<SupabaseClient> {
  if (!URL || !ANON) throw new Error('Supabase not configured for this build (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(URL, ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  }
  return client;
}
