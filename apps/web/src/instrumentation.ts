import * as Sentry from '@sentry/nextjs';

/** Server-side error reporting. Does nothing until SENTRY_DSN is set. */
export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0.1,
  });
}

export const onRequestError = Sentry.captureRequestError;
