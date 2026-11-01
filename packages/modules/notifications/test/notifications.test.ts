import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { freshTestDb, testDatabaseUrl } from '@orbita/db/test-support';
import { deliverEmails, listNotifications, markRead, notify } from '../src';

describe.skipIf(!testDatabaseUrl)('notifications (Postgres)', () => {
  let t: Awaited<ReturnType<typeof freshTestDb>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await freshTestDb('notify');
    for (const [n, status] of [['ana', 'active'], ['ben', 'active'], ['gone', 'deactivated']] as const) {
      ids[n] = randomUUID();
      await t.db.execute(sql`insert into auth.users (id, email) values (${ids[n]!}, ${n + '@example.com'})`);
      await t.db.execute(sql`insert into profiles (id, email, full_name, status) values (${ids[n]!}, ${n + '@example.com'}, ${n}, ${status})`);
    }
  });
  afterAll(async () => t?.drop());

  it('notifies active people once, never the person who caused it', async () => {
    const n = await t.db.transaction((tx) => notify(tx, [ids.ana, ids.ana, ids.ben, ids.gone, null], { kind: 'x', title: 'Hello', link: '/reviews/1' }, { except: ids.ben }));
    expect(n).toBe(1);
    const list = await listNotifications(t.db, { id: ids.ana! });
    expect(list).toMatchObject({ unread: 1, items: [{ title: 'Hello' }] });
    await markRead(t.db, { id: ids.ana! });
    expect((await listNotifications(t.db, { id: ids.ana! })).unread).toBe(0);
  });

  it('emails each notification once, with an absolute link', async () => {
    const sent: { to: string; url: string | null }[] = [];
    const mailer = { sendNotification: async (to: string, m: { url: string | null }) => (sent.push({ to, url: m.url }), { delivered: true }) };
    expect(await deliverEmails(t.db, mailer, { appUrl: 'https://orbita.example' })).toEqual({ claimed: 1, delivered: 1 });
    expect(sent).toEqual([{ to: 'ana@example.com', url: 'https://orbita.example/reviews/1' }]);
    expect(await deliverEmails(t.db, mailer, { appUrl: 'https://orbita.example' })).toEqual({ claimed: 0, delivered: 0 });
  });
});
