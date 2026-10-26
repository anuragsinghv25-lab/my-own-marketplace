'use server';

import { timingSafeEqual } from 'node:crypto';
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '@orbita/audit';
import { getDb, profiles } from '@orbita/db';
import { isAppError } from '@orbita/domain';
import { bootstrapPlatform, completeInvite, confirmUrl, needsBootstrap, recordSignIn } from '@orbita/identity';
import type { ActionState } from '@/lib/action-state';
import { safeNext } from '@/lib/safe-next';
import { recoveryLink, signInLink, supabaseAuthDirectory } from '@/server/auth-directory';
import { configStatus, env } from '@/server/env';
import { log } from '@/server/log';
import { mailer } from '@/server/mailer';
import { requestMeta } from '@/server/request';
import { requireSession } from '@/server/session';
import { createServerSupabase } from '@/server/supabase';

const emailSchema = z.email('Enter a valid email address').transform((e) => e.trim().toLowerCase());
const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
  .regex(/[a-zA-Z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

const fail = (message: string, fieldErrors?: Record<string, string[] | undefined>): ActionState => ({
  status: 'error',
  message,
  fieldErrors,
});

async function profileByEmail(email: string) {
  const [p] = await getDb()
    .select()
    .from(profiles)
    .where(sql`lower(${profiles.email}) = ${email}`)
    .limit(1);
  return p ?? null;
}

// ---------------------------------------------------------------- sign in

export async function signInWithPassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1, 'Enter your password') })
    .safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return fail('Check the highlighted fields.', z.flattenError(parsed.error).fieldErrors);

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    if (error?.message?.toLowerCase().includes('banned')) return fail('This account has been deactivated.');
    return fail('That email and password do not match.');
  }
  const profile = await profileByEmail(parsed.data.email);
  if (!profile || profile.status === 'deactivated') {
    await supabase.auth.signOut();
    return fail(profile ? 'This account has been deactivated.' : 'This account has no access yet. Ask your platform admin.');
  }
  await recordSignIn({ db: getDb() }, { id: profile.id, email: profile.email, fullName: profile.fullName }, await requestMeta(), 'password');
  redirect(profile.status === 'invited' ? '/welcome' : safeNext(form.get('next')));
}

export async function sendSignInLink(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(form.get('email'));
  if (!parsed.success) return fail('Enter a valid email address.', { email: ['Enter a valid email address'] });
  if (!configStatus().email) return fail('Email sign-in is not switched on yet. Use your password.');

  const generic: ActionState = { status: 'ok', message: 'If that address has an account, a sign-in link is on its way.' };
  const profile = await profileByEmail(parsed.data);
  // Only existing, active accounts get a link (generateLink would otherwise create a user).
  if (!profile || profile.status !== 'active') return generic;
  const link = await signInLink(profile.email);
  if (link) await mailer.sendSignInLink(profile.email, confirmUrl(env.appUrl(), link, safeNext(form.get('next'))));
  return generic;
}

// ---------------------------------------------------------------- password reset

export async function requestPasswordReset(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(form.get('email'));
  if (!parsed.success) return fail('Enter a valid email address.', { email: ['Enter a valid email address'] });
  const generic: ActionState = { status: 'ok', message: 'If that address has an account, a reset link is on its way.' };

  const profile = await profileByEmail(parsed.data);
  if (!profile || profile.status === 'deactivated') return generic;

  if (configStatus().email) {
    const link = await recoveryLink(profile.email);
    if (link) await mailer.sendPasswordReset(profile.email, confirmUrl(env.appUrl(), link, '/reset-password'));
  } else {
    // Fallback: Supabase's own mailer (rate-limited; fine until Resend is connected).
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: `${env.appUrl()}/auth/confirm?next=/reset-password`,
    });
    if (error) log.warn('auth.reset_fallback_failed', { error: error.message });
  }
  return generic;
}

export async function updatePassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireSession({ allowInvited: true });
  const parsed = z
    .object({ password: passwordSchema, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
    .safeParse({ password: form.get('password'), confirm: form.get('confirm') });
  if (!parsed.success) return fail('Check the highlighted fields.', z.flattenError(parsed.error).fieldErrors);

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(error.message);
  await recordAudit(getDb(), { actor: session.actor, meta: await requestMeta() }, {
    action: 'auth.password_changed',
    subjectType: 'user',
    subjectId: session.actor.id,
    summary: `${session.actor.email} changed their password`,
  });
  redirect('/');
}

// ---------------------------------------------------------------- accept invite

export async function acceptInvite(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireSession({ allowInvited: true });
  const parsed = z
    .object({ fullName: z.string().trim().min(1, 'Enter your name').max(120), password: passwordSchema, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
    .safeParse({ fullName: form.get('fullName'), password: form.get('password'), confirm: form.get('confirm') });
  if (!parsed.success) return fail('Check the highlighted fields.', z.flattenError(parsed.error).fieldErrors);

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: { full_name: parsed.data.fullName },
  });
  if (error) return fail(error.message);
  await completeInvite({ db: getDb() }, session.actor, await requestMeta(), { fullName: parsed.data.fullName });
  redirect('/');
}

// ---------------------------------------------------------------- first-run setup

function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function runSetup(_prev: ActionState, form: FormData): Promise<ActionState> {
  const expected = env.setupToken();
  if (!expected) return fail('Set SETUP_TOKEN in the environment first.');
  if (!tokenMatches(String(form.get('token') ?? ''), expected)) return fail('The setup token is not correct.', { token: ['Not correct'] });
  if (!(await needsBootstrap(getDb()))) return fail('Setup has already been completed. Sign in instead.');

  const withDemo = form.get('demo') === 'on';
  const parsed = z
    .object({ fullName: z.string().trim().min(1, 'Enter a name'), email: emailSchema, password: passwordSchema })
    .safeParse({ fullName: form.get('fullName'), email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return fail('Check the highlighted fields.', z.flattenError(parsed.error).fieldErrors);
  const demoPassword = String(form.get('demoPassword') ?? '');
  if (withDemo) {
    const dp = passwordSchema.safeParse(demoPassword);
    if (!dp.success) return fail('Check the highlighted fields.', { demoPassword: dp.error.issues.map((i) => i.message) });
  }

  try {
    const result = await bootstrapPlatform({ db: getDb(), auth: supabaseAuthDirectory }, await requestMeta(), {
      admin: parsed.data,
      demo: withDemo ? { password: demoPassword, emailDomain: String(form.get('demoDomain') || 'example.com') } : null,
    });
    return {
      status: 'ok',
      message: 'Setup complete.',
      data: { adminEmail: parsed.data.email, demoUsers: result.demoUsers },
    };
  } catch (err) {
    log.error('setup.failed', { err });
    return fail(isAppError(err) ? err.message : 'Setup failed. Check the server logs.');
  }
}
