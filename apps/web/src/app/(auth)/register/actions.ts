'use server';

import { redirect } from 'next/navigation';
import { getDb, profiles } from '@orbita/db';
import { eq } from 'drizzle-orm';
import { recordSignIn } from '@orbita/identity';
import { resendSignupCode, signUpSeller, verifySignupCode, type SignupInput } from '@orbita/sellers';
import type { ActionState } from '@/lib/action-state';
import { runAction } from '@/server/actions';
import { sellerDeps } from '@/server/deps';
import { env } from '@/server/env';
import { requestMeta } from '@/server/request';
import { createServerSupabase } from '@/server/supabase';

// Without email, showing the code proves nothing about the address, so it is only shown in demo mode.
const shown = (code: string | null) => (code && env.demoMode() ? code : null);

export async function registerSellerAction(input: SignupInput): Promise<ActionState> {
  return runAction(async () => {
    const r = await signUpSeller(sellerDeps(), await requestMeta(), input);
    const code = shown(r.code);
    return {
      status: 'ok',
      message: r.delivered ? `We emailed a 6-digit code to ${r.email}.` : code ? `Email is not set up here (demo mode). Your code is ${code}.` : 'Your registration is saved, but we could not send the email. Use “Send a new code” in a minute, or contact support.',
      data: { email: r.email },
    };
  });
}

export async function resendCodeAction(email: string): Promise<ActionState> {
  return runAction(async () => {
    const r = await resendSignupCode(sellerDeps(), { email });
    const code = shown(r.code);
    return { status: 'ok', message: r.delivered ? `If ${r.email} is waiting for a code, a new one is on its way.` : code ? `Demo mode: your new code is ${code}.` : 'We could not send the email. Try again later, or contact support.' };
  });
}

/** Checks the code, then signs the seller in with the password they just chose (when this browser still has it). */
export async function verifyCodeAction(input: { email: string; code: string; password?: string }): Promise<ActionState> {
  const res = await runAction(async () => {
    const meta = await requestMeta();
    const r = await verifySignupCode(sellerDeps(), meta, input);
    if (!input.password) return { status: 'ok', data: { signedIn: false } };
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email: r.email, password: input.password });
    if (error) return { status: 'ok', data: { signedIn: false } };
    const [p] = await getDb().select().from(profiles).where(eq(profiles.id, r.userId));
    if (p) await recordSignIn({ db: getDb() }, { id: p.id, email: p.email, fullName: p.fullName }, meta, 'password');
    return { status: 'ok', data: { signedIn: true } };
  });
  if (res.status === 'ok') redirect(res.data?.signedIn ? '/seller' : '/login?confirmed=1');
  return res;
}
