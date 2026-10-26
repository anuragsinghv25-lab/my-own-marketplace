import 'server-only';
import { getDb } from '@orbita/db';
import type { IdentityDeps } from '@orbita/identity';
import { supabaseAuthDirectory } from './auth-directory';
import { env } from './env';
import { mailer } from './mailer';

/** Wires the identity module to Postgres, Supabase Auth and Resend. */
export function identityDeps(): IdentityDeps {
  return { db: getDb(), auth: supabaseAuthDirectory, mailer, appUrl: env.appUrl() };
}
