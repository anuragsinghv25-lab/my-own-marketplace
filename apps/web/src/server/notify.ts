import 'server-only';
import { after } from 'next/server';
import { getDb } from '@orbita/db';
import { deliverEmails } from '@orbita/notifications';
import { env } from './env';
import { log } from './log';
import { mailer } from './mailer';

/** Sends the emails for notifications written by the action that just ran, after the response. */
export function deliverNotificationEmails() {
  if (!env.resendApiKey()) return;
  after(async () => {
    try {
      await deliverEmails(getDb(), mailer, { appUrl: env.appUrl() });
    } catch (err) {
      log.error('notifications.email_failed', { err });
    }
  });
}
