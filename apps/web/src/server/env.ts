import 'server-only';

/**
 * Environment access in one place. Names accept both a hand-made setup and the variables
 * that the Supabase ↔ Vercel integration creates, so connecting the integration is enough.
 */
const first = (...names: string[]) => {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
};

export const env = {
  supabaseUrl: () => first('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'),
  supabasePublishableKey: () =>
    first('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'),
  supabaseSecretKey: () => first('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'),
  databaseUrl: () => first('DATABASE_URL', 'POSTGRES_URL'),
  resendApiKey: () => first('RESEND_API_KEY'),
  emailFrom: () => first('EMAIL_FROM') ?? 'Orbita <onboarding@resend.dev>',
  setupToken: () => first('SETUP_TOKEN'),
  sentryDsn: () => first('SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN'),
  demoMode: () => first('NEXT_PUBLIC_DEMO_MODE') === 'true',
  marketplaceName: () => first('NEXT_PUBLIC_MARKETPLACE_NAME') ?? 'Orbita',
  /** Public base URL used in emails. Falls back to the Vercel URL, then localhost. */
  appUrl: () => {
    const explicit = first('APP_URL', 'NEXT_PUBLIC_APP_URL');
    if (explicit) return explicit.replace(/\/$/, '');
    const prod = first('VERCEL_PROJECT_PRODUCTION_URL');
    if (process.env.VERCEL_ENV === 'production' && prod) return `https://${prod}`;
    const vercel = first('VERCEL_BRANCH_URL', 'VERCEL_URL');
    if (vercel) return `https://${vercel}`;
    return 'http://localhost:3000';
  },
};

export interface ConfigStatus {
  supabase: boolean;
  supabaseAdmin: boolean;
  database: boolean;
  email: boolean;
  sentry: boolean;
}

export function configStatus(): ConfigStatus {
  return {
    supabase: Boolean(env.supabaseUrl() && env.supabasePublishableKey()),
    supabaseAdmin: Boolean(env.supabaseUrl() && env.supabaseSecretKey()),
    database: Boolean(env.databaseUrl()),
    email: Boolean(env.resendApiKey()),
    sentry: Boolean(env.sentryDsn()),
  };
}

export function isCoreConfigured(): boolean {
  const s = configStatus();
  return s.supabase && s.supabaseAdmin && s.database;
}
