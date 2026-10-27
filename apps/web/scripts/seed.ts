/**
 * Local development seed: first platform admin + one demo user per role.
 * Usage (with apps/web/.env.local filled in and `supabase start` running):
 *   pnpm db:seed
 * Hosted environments use the /setup page instead.
 */
import { createClient } from '@supabase/supabase-js';
import { createDb } from '@orbita/db';
import { bootstrapPlatform, needsBootstrap, type AuthDirectory } from '@orbita/identity';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.DATABASE_URL;
if (!url || !secret || !dbUrl) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and DATABASE_URL (see .env.example).');
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const auth: AuthDirectory = {
  invite: () => Promise.reject(new Error('not used by seed')),
  magicLink: () => Promise.reject(new Error('not used by seed')),
  async createWithPassword(email, password, fullName) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error || !data.user) throw error ?? new Error('no user');
    return { userId: data.user.id };
  },
  async setPassword(id, password) {
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) throw error;
  },
  async setBanned() {},
  async delete(id) {
    await admin.auth.admin.deleteUser(id);
  },
};

const { db, sql } = createDb(dbUrl, { max: 1 });
try {
  if (!(await needsBootstrap(db))) {
    console.log('Already seeded (a platform admin exists).');
  } else {
    const password = process.env.SEED_PASSWORD ?? 'OrbitaDemo123';
    const r = await bootstrapPlatform({ db, auth }, { requestId: 'seed' }, {
      admin: { email: 'admin@example.com', fullName: 'Platform Admin', password },
      demo: { password, emailDomain: 'example.com' },
    });
    console.log(`Seeded admin@example.com and the demo team (${r.demoUsers.map((u) => u.email).join(', ')}). Password: ${password}`);
  }
} finally {
  await sql.end();
}
