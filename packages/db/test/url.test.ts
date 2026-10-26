import { describe, expect, it } from 'vitest';
import { appDatabaseUrl, migrationDatabaseUrl } from '../src/url';

const pooler = 'postgres://postgres.abc:pw@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x';
const direct = 'postgres://postgres:pw@db.abc.supabase.co:5432/postgres?sslmode=require';

describe('database urls', () => {
  it('uses DATABASE_URL, then POSTGRES_URL, without Supabase-only params', () => {
    expect(appDatabaseUrl({ POSTGRES_URL: pooler })).toBe(
      'postgres://postgres.abc:pw@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require',
    );
    expect(appDatabaseUrl({ DATABASE_URL: 'postgres://a@b/c', POSTGRES_URL: pooler })).toBe('postgres://a@b/c');
  });
  it('migrates through the session pooler, not the IPv6-only direct host', () => {
    expect(migrationDatabaseUrl({ POSTGRES_URL: pooler, POSTGRES_URL_NON_POOLING: direct })).toContain('pooler.supabase.com:5432/');
    expect(migrationDatabaseUrl({ DATABASE_URL: pooler })).toContain(':5432/');
  });
  it('honours an explicit DATABASE_URL_DIRECT', () => {
    expect(migrationDatabaseUrl({ DATABASE_URL_DIRECT: direct, POSTGRES_URL: pooler })).toContain('db.abc.supabase.co');
  });
  it('requires SSL for Supabase hosts', () => {
    expect(appDatabaseUrl({ DATABASE_URL: 'postgresql://postgres.abc:pw@aws-1-ap-south-1.pooler.supabase.com:6543/postgres' })).toMatch(/\?sslmode=require$/);
    expect(appDatabaseUrl({ DATABASE_URL: 'postgres://postgres@127.0.0.1:54322/postgres' })).not.toContain('sslmode');
  });
  it('returns undefined when nothing is set', () => {
    expect(migrationDatabaseUrl({})).toBeUndefined();
  });
});
