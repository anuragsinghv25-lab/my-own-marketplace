import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/forms';
import { Notice } from '@/components/auth/auth-frame';
import { safeNext } from '@/lib/safe-next';
import { configStatus, env } from '@/server/env';
import { getSessionState } from '@/server/session';

export const metadata: Metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = {
  link: 'That link has expired or was already used. Request a new one.',
  deactivated: 'This account has been deactivated. Contact your platform admin.',
  'no-profile': 'This sign-in has no Orbita account yet. Ask your platform admin for an invite.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const state = await getSessionState();
  if (state.state === 'unconfigured') redirect('/setup');
  if (state.state === 'ok') redirect(safeNext(sp.next, state.session.homePath));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-sm text-mute mt-1 mb-6">Use the account your administrator created for you.</p>
      <div className="space-y-4">
        {sp.error && ERRORS[sp.error] ? <Notice tone="bad">{ERRORS[sp.error]}</Notice> : null}
        {sp.signedout ? <Notice tone="accent">You have signed out.</Notice> : null}
        <LoginForm next={safeNext(sp.next)} emailEnabled={configStatus().email} />
      </div>
      {env.demoMode() ? (
        <p className="mt-6 rounded-xl bg-soft p-3.5 text-xs text-mute">
          Demo mode: accounts are named after roles, e.g. <code className="text-ink">category-checker@example.com</code>.{' '}
          <Link href="/design" className="text-accent hover:underline">
            See the design system
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
