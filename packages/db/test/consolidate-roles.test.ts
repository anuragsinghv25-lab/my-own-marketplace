import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { testDatabaseUrl } from '../test-support/test-db';

const folder = path.resolve(import.meta.dirname, '../../../supabase/migrations');
const files = readdirSync(folder).filter((f) => f.endsWith('.sql')).sort();
const stub = readFileSync(path.resolve(import.meta.dirname, '../test-support/auth-stub.sql'), 'utf8');
const run = (sql: postgres.Sql, f: string) => sql.unsafe(readFileSync(path.join(folder, f), 'utf8'));

/** Upgrades a database that has users on the original 18 roles (what the live R0 database holds). */
describe.skipIf(!testDatabaseUrl)('R0.1 role consolidation migration', () => {
  const name = `orbita_test_roles_${process.pid}`;
  const admin = () => postgres(testDatabaseUrl!, { max: 1, onnotice: () => {} });
  afterAll(async () => {
    const a = admin();
    await a.unsafe(`drop database if exists "${name}" with (force)`);
    await a.end();
  });

  it('maps legacy grants, revokes old ones, flags demo accounts and keeps separation of duties', async () => {
    const a = admin();
    await a.unsafe(`drop database if exists "${name}" with (force)`);
    await a.unsafe(`create database "${name}"`);
    await a.end();
    const u = new URL(testDatabaseUrl!);
    u.pathname = `/${name}`;
    const sql = postgres(u.toString(), { max: 1, onnotice: () => {} });
    try {
      await sql.unsafe(stub);
      const target = files.findIndex((f) => f.includes('consolidate_roles'));
      for (const f of files.slice(0, target)) await run(sql, f);

      const users: Record<string, string[]> = {
        admin: ['platform_admin'],
        checker: ['category_checker'],
        maker: ['category_creator', 'category_drafter'],
        both: ['brand_specialist', 'agency_manager'], // would become reviewer + approver
        tm: ['template_manager'],
        lister: ['seller_lister'],
      };
      const ids: Record<string, string> = {};
      for (const [k, roles] of Object.entries(users)) {
        const [row] = await sql<{ id: string }[]>`insert into auth.users (id, email) values (gen_random_uuid(), ${k + '@example.com'}) returning id`;
        ids[k] = row!.id;
        await sql`insert into profiles (id, email, status) values (${row!.id}, ${k + '@example.com'}, 'active')`;
        for (const r of roles) {
          const scope = r.startsWith('seller') ? 'org' : 'global';
          const scopeId = scope === 'org' ? '00000000-0000-4000-8000-0000000000d1' : null;
          await sql`insert into role_grants (user_id, role, scope_type, scope_id) values (${row!.id}, ${r}, ${scope}, ${scopeId})`;
        }
        await sql`insert into audit_events (action, subject_type, subject_id, summary, after)
                  values ('user.seeded', 'user', ${row!.id}, 'seeded', ${sql.json({ role: roles[0]! })})`;
      }

      for (const f of files.slice(target)) await run(sql, f);

      const active = async (k: string) =>
        (await sql<{ role: string }[]>`select role from role_grants where user_id = ${ids[k]!} and revoked_at is null order by role`).map((r) => r.role);
      expect(await active('admin')).toEqual(['platform_admin']);
      expect(await active('checker')).toEqual(['category_manager']);
      expect(await active('maker')).toEqual(['category_manager']); // two legacy roles → one grant
      expect(await active('both')).toEqual(['approver']); // never reviewer + approver
      expect(await active('tm')).toEqual([]);
      expect(await active('lister')).toEqual(['seller_staff']);

      const demo = await sql<{ email: string }[]>`select email from profiles where is_demo order by email`;
      expect(demo.map((d) => d.email)).not.toContain('admin@example.com');
      expect(demo).toHaveLength(5);

      const revoked = await sql<{ n: number }[]>`select count(*)::int as n from role_grants where revoked_at is not null`;
      expect(revoked[0]?.n).toBe(7);
      const traces = await sql<{ n: number }[]>`select count(*)::int as n from audit_events where action = 'system.roles_consolidated'`;
      expect(traces[0]?.n).toBe(1);
    } finally {
      await sql.end();
    }
  });
});
