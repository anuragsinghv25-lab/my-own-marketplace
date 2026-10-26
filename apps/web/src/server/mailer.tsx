import 'server-only';
import type { ReactElement } from 'react';
import { Resend } from 'resend';
import type { InviteEmail as InvitePayload, Mailer } from '@orbita/identity';
import { InviteEmail, ResetPasswordEmail, SignInLinkEmail } from '@/emails/templates';
import { env } from './env';
import { log } from './log';

let client: Resend | undefined;

async function send(to: string, subject: string, react: ReactElement): Promise<{ delivered: boolean }> {
  const key = env.resendApiKey();
  if (!key) {
    log.warn('email.not_configured', { to, subject });
    return { delivered: false };
  }
  client ??= new Resend(key);
  const { error } = await client.emails.send({ from: env.emailFrom(), to, subject, react });
  if (error) {
    log.error('email.failed', { to, subject, error: error.message });
    return { delivered: false };
  }
  log.info('email.sent', { to, subject });
  return { delivered: true };
}

export const mailer: Mailer & {
  sendSignInLink(to: string, url: string): Promise<{ delivered: boolean }>;
  sendPasswordReset(to: string, url: string): Promise<{ delivered: boolean }>;
} = {
  sendInvite: (e: InvitePayload) =>
    send(
      e.to,
      `You're invited to ${env.marketplaceName()}`,
      <InviteEmail marketplace={env.marketplaceName()} {...e} />,
    ),
  sendSignInLink: (to, url) =>
    send(to, `Your ${env.marketplaceName()} sign-in link`, <SignInLinkEmail marketplace={env.marketplaceName()} url={url} />),
  sendPasswordReset: (to, url) =>
    send(to, `Reset your ${env.marketplaceName()} password`, <ResetPasswordEmail marketplace={env.marketplaceName()} url={url} />),
};
