import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { decideMigration, readStamp } from '../src/environment';
import { testDatabaseUrl } from '../test-support/test-db';

describe.skipIf(!testDatabaseUrl)('preview builds never migrate the production database', () => {
  const name = `orbita_test_env_${process.pid}`;
  const admin = () => postgres(testDatabaseUrl!, { max: 1, onnotice: () => {} });
  const url = () => {
    const u = new URL(testDatabaseUrl!);
    u.pathname = `/${name}`;
    return u.toString();
  };
  const fresh = async () => {
    const a = admin();
    await a.unsafe(`drop database if exists "${name}" with (force)`);
    await a.unsafe(`create database "${name}"`);
    await a.end();
    return postgres(url(), { max: 1, onnotice: () => {} });
  };
  afterAll(async () => {
    const a = admin();
    await a.unsafe(`drop database if exists "${name}" with (force)`);
    await a.end();
  });

  it('local and CI runs migrate without stamping', async () => {
    const sql = await fresh();
    try {
      expect(await decideMigration(sql, undefined)).toEqual({ action: 'migrate' });
      expect(await readStamp(sql)).toBeNull();
    } finally {
      await sql.end();
    }
  });

  it('production stamps the database, and a later preview build skips', async () => {
    const sql = await fresh();
    try {
      expect(await decideMigration(sql, 'production')).toEqual({ action: 'migrate' });
      expect(await readStamp(sql)).toBe('production');
      const preview = await decideMigration(sql, 'preview');
      expect(preview.action).toBe('skip');
      expect(await decideMigration(sql, 'production')).toEqual({ action: 'migrate' });
    } finally {
      await sql.end();
    }
  });

  it('a preview database is stamped and keeps migrating; production refuses it', async () => {
    const sql = await fresh();
    try {
      expect(await decideMigration(sql, 'preview')).toEqual({ action: 'migrate' });
      expect(await decideMigration(sql, 'preview')).toEqual({ action: 'migrate' });
      expect(await readStamp(sql)).toBe('preview');
      await expect(decideMigration(sql, 'production')).rejects.toThrow(/stamped "preview"/);
    } finally {
      await sql.end();
    }
  });
});
