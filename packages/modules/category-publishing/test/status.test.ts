import { describe, expect, it } from 'vitest';
import { computeStatus, todayIn } from '../src/status';

const sch = (sellerGoLive: string, buyerGoLive: string, minCatalogs = 0, testMode = false) => ({ sellerGoLive, buyerGoLive, minCatalogs, testMode });
const base = { published: null, scheduled: null, override: null, catalogs: 0, today: '2026-11-05' };

describe('category status', () => {
  it('dates are taken in India, not UTC', () => {
    // 20:00 UTC on the 1st is already the 2nd in India
    expect(todayIn('Asia/Kolkata', new Date('2026-11-01T20:00:00Z'))).toBe('2026-11-02');
  });

  it('never live, then scheduled (with test mode), then live for sellers, then live', () => {
    expect(computeStatus(base).key).toBe('never_live');
    expect(computeStatus({ ...base, scheduled: { number: 0, schedule: sch('2026-11-09', '2026-11-16', 0, true) } })).toMatchObject({ key: 'scheduled', testMode: true, sellers: false, note: 'v0 goes live for sellers on 9 Nov 2026. Test accounts can see it now.' });
    const pub = { number: 0, schedule: sch('2026-11-01', '2026-11-09') };
    expect(computeStatus({ ...base, published: pub })).toMatchObject({ key: 'live_for_sellers', sellers: true, buyers: false, note: 'Buyers from 9 Nov 2026.' });
    expect(computeStatus({ ...base, published: pub, today: '2026-11-09' })).toMatchObject({ key: 'live', buyers: true });
  });

  it('buyers can wait for enough catalogs', () => {
    const pub = { number: 2, schedule: sch('2026-11-01', '2026-11-01', 10) };
    expect(computeStatus({ ...base, published: pub, catalogs: 3 })).toMatchObject({ key: 'live_for_sellers', note: 'Buyers wait for 10 catalogs (3 so far).' });
    expect(computeStatus({ ...base, published: pub, catalogs: 10 }).key).toBe('live');
  });

  it('overrides take sellers, buyers or both away', () => {
    const pub = { number: 0, schedule: sch('2026-11-01', '2026-11-01') };
    const o = (status: 'down_for_buyers' | 'down_for_sellers' | 'maintenance' | 'deactivated') => computeStatus({ ...base, published: pub, override: { status, reason: 'Because', endsAt: null } });
    expect(o('down_for_buyers')).toMatchObject({ sellers: true, buyers: false, label: 'Down for buyers' });
    expect(o('down_for_sellers')).toMatchObject({ sellers: false, buyers: true });
    expect(o('maintenance')).toMatchObject({ sellers: false, buyers: false, label: 'Down for maintenance' });
    expect(o('deactivated')).toMatchObject({ sellers: false, buyers: false, note: 'Because.' });
  });
});
