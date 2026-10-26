import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Runs before every page request:
 * 1. refreshes the Supabase session cookie when it is about to expire;
 * 2. sends signed-out visitors of protected pages to /login.
 * Authorisation (roles) is checked on the server in each page / route, not here.
 */
const PUBLIC_PREFIXES = ['/login', '/forgot-password', '/auth/', '/setup', '/design', '/api/'];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY;

  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);

  // Not configured yet: let pages render their own "finish setup" message.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: requestHeaders } });
        response.headers.set('x-request-id', requestId);
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  // Do not run code between createServerClient and getClaims (Supabase SSR guidance).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const path = request.nextUrl.pathname;
  const isPublic = path === '/' ? false : PUBLIC_PREFIXES.some((p) => path.startsWith(p));
  if (!signedIn && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    if (path !== '/') login.searchParams.set('next', path + request.nextUrl.search);
    const redirect = NextResponse.redirect(login);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)'],
};
