import { NextResponse, type NextRequest } from 'next/server';
import { isCoreConfigured } from '@/server/env';
import { createServerSupabase } from '@/server/supabase';

async function signOut(request: NextRequest) {
  if (isCoreConfigured()) {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  }
  const target = request.nextUrl.clone();
  target.pathname = '/login';
  const reason = request.nextUrl.searchParams.get('reason');
  target.search = reason ? `?error=${encodeURIComponent(reason)}` : '?signedout=1';
  return NextResponse.redirect(target, { status: 303 });
}

export const POST = signOut;
// GET is used by server redirects (deactivated account, missing profile).
export const GET = signOut;
