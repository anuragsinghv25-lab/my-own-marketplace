import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import { buttonClass } from '@orbita/ui';
import { getDb } from '@orbita/db';
import { needsBootstrap } from '@orbita/identity';
import { SetupForm } from '@/components/auth/forms';
import { Notice } from '@/components/auth/auth-frame';
import { configStatus, env, isCoreConfigured } from '@/server/env';

export const metadata: Metadata = { title: 'Setup' };
export const dynamic = 'force-dynamic';

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex gap-2.5">
      {ok ? <CheckCircle2 size={18} className="text-ok shrink-0 mt-0.5" /> : <CircleDashed size={18} className="text-mute shrink-0 mt-0.5" />}
      <div>
        <div className="text-sm font-medium">{label}</div>
        {!ok ? <div className="text-xs text-mute">{hint}</div> : null}
      </div>
    </li>
  );
}

export default async function SetupPage() {
  const s = configStatus();
  let dbError: string | null = null;
  let needs = true;
  if (isCoreConfigured()) {
    try {
      needs = await needsBootstrap(getDb());
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Set up {env.marketplaceName()}</h1>
      <p className="text-sm text-mute mt-1 mb-6">One-time setup: check the connections, then create the first platform admin.</p>
      <ul className="space-y-2.5 rounded-2xl border border-line bg-card p-4 mb-6">
        <Check ok={s.supabase} label="Supabase project" hint="NEXT_PUBLIC_SUPABASE_URL and the publishable (anon) key." />
        <Check ok={s.supabaseAdmin} label="Supabase admin key" hint="SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)." />
        <Check ok={s.database && !dbError} label="Database" hint={dbError ?? 'DATABASE_URL (or POSTGRES_URL from the Supabase integration).'} />
        <Check ok={s.email} label="Email (optional)" hint="RESEND_API_KEY and EMAIL_FROM. Without it, invite links are shown to the admin." />
        <Check ok={Boolean(env.setupToken())} label="Setup token" hint="SETUP_TOKEN, any long random string." />
      </ul>

      {!isCoreConfigured() || dbError ? (
        <Notice tone="warn">Finish the connections above (Vercel → Settings → Environment Variables), then redeploy.</Notice>
      ) : !needs ? (
        <div className="space-y-4">
          <Notice tone="ok">Setup is complete. A platform admin exists.</Notice>
          <Link href="/login" className={`${buttonClass('primary', 'lg')} w-full`}>
            Go to sign in
          </Link>
        </div>
      ) : !env.setupToken() ? (
        <Notice tone="warn">Add SETUP_TOKEN in Vercel, redeploy, then reload this page.</Notice>
      ) : (
        <SetupForm />
      )}
    </div>
  );
}
