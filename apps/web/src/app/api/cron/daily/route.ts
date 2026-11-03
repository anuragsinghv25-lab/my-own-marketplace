import { NextResponse } from 'next/server';
import { runDaily } from '@orbita/category-publishing';
import { getDb } from '@orbita/db';
import { deliverEmails } from '@orbita/notifications';
import { purgeUnverifiedSignups } from '@orbita/sellers';
import { supabaseAuthDirectory } from '@/server/auth-directory';
import { env } from '@/server/env';
import { log } from '@/server/log';
import { mailer } from '@/server/mailer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Vercel Cron calls this once a day (apps/web/vercel.json): scheduled categories go live, overdue
 * reviews get reminders and escalations, any email that did not go out is sent, and
 * seller sign-ups whose email was never confirmed are removed after a week. Pages that show
 * go-live state also promote due versions when they load, so a late cron run is never visible.
 */
export async function GET(req: Request) {
  const secret = env.cronSecret();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Not allowed.' }, { status: 401 });
  const db = getDb();
  const daily = await runDaily(db);
  const purgedSignups = await purgeUnverifiedSignups({ db, auth: supabaseAuthDirectory }).catch((err) => (log.error('cron.purge_signups_failed', { err }), 0));
  const email = env.resendApiKey() ? await deliverEmails(db, mailer, { appUrl: env.appUrl(), limit: 200 }) : { claimed: 0, delivered: 0 };
  log.info('cron.daily', { ...daily, purgedSignups, emailed: email.delivered });
  return NextResponse.json({ ok: true, ...daily, purgedSignups, emailed: email.delivered });
}
