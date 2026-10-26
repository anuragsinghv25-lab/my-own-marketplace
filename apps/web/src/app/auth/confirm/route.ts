import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/safe-next';
import { createServerSupabase } from '@/server/supabase';

/**
 * Landing URL of every emailed link (invite, sign-in link, password reset).
 * Verifies the one-time token, which sets the session cookie, then continues to `next`.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get('next'));
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  const code = params.get('code');
  const supabase = await createServerSupabase();

  let ok = false;
  if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;

  const target = request.nextUrl.clone();
  target.search = '';
  if (ok) {
    // `next` may carry its own query string
    const [p, q] = next.split('?');
    target.pathname = p!;
    if (q) target.search = `?${q}`;
  } else {
    target.pathname = '/login';
    target.searchParams.set('error', 'link');
  }
  return NextResponse.redirect(target);
}
