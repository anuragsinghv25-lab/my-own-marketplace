import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { env } from './env';

/** Supabase client bound to the current request's cookies (server components, actions, route handlers). */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const url = env.supabaseUrl();
  const key = env.supabasePublishableKey();
  if (!url || !key) throw new Error('Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / key).');
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a server component: cookies are read-only there. The proxy refreshes sessions.
        }
      },
    },
  });
}

let admin: SupabaseClient | undefined;

/** Service client for the Auth Admin API. Never expose to the browser. */
export function adminSupabase(): SupabaseClient {
  if (admin) return admin;
  const url = env.supabaseUrl();
  const key = env.supabaseSecretKey();
  if (!url || !key) throw new Error('Supabase admin is not configured (SUPABASE_SECRET_KEY).');
  admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return admin;
}
