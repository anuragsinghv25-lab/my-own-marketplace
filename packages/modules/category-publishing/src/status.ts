/**
 * What sellers and buyers can do with a category today, from its versions, go-live dates and any
 * operational override (downtime, maintenance, deactivation). Pure, so it is easy to test and the
 * same answer is given by the status page, the API and (from R4/R5) the seller and buyer apps.
 */

/** Dates are compared in the marketplace's own time zone. */
export const PLATFORM_TIMEZONE = 'Asia/Kolkata';

export function todayIn(timeZone = PLATFORM_TIMEZONE, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export type OpStatus = 'active' | 'deactivated' | 'down_for_buyers' | 'down_for_sellers' | 'maintenance';

export interface ScheduleLike {
  sellerGoLive: string;
  buyerGoLive: string;
  minCatalogs: number;
  testMode: boolean;
}

export interface StatusInput {
  /** the version serving sellers now, if any */
  published: { number: number; schedule: ScheduleLike | null } | null;
  /** an approved version waiting for its go-live date */
  scheduled: { number: number; schedule: ScheduleLike } | null;
  /** the override in force now, if any */
  override: { status: OpStatus; reason: string; endsAt: Date | null } | null;
  /** live catalogs in the category (R5 supplies the count; 0 until then) */
  catalogs: number;
  today: string;
}

export type StatusKey =
  | 'never_live'
  | 'scheduled'
  | 'live'
  | 'live_for_sellers'
  | 'deactivated'
  | 'down_for_buyers'
  | 'down_for_sellers'
  | 'maintenance';

export const STATUS_LABELS: Record<StatusKey, string> = {
  never_live: 'Never live',
  scheduled: 'Scheduled',
  live: 'Live',
  live_for_sellers: 'Live for sellers',
  deactivated: 'Deactivated',
  down_for_buyers: 'Down for buyers',
  down_for_sellers: 'Down for sellers',
  maintenance: 'Down for maintenance',
};

export interface CategoryStatus {
  key: StatusKey;
  label: string;
  sellers: boolean;
  buyers: boolean;
  /** only designated test accounts see it (an approved version waiting for go-live in test mode) */
  testMode: boolean;
  /** one sentence for people, e.g. "Buyers from 10 Nov 2026" */
  note: string;
}

const fmt = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m! - 1]} ${y}`;
};

export function computeStatus(s: StatusInput): CategoryStatus {
  const out = (key: StatusKey, sellers: boolean, buyers: boolean, note: string, testMode = false): CategoryStatus => ({ key, label: STATUS_LABELS[key], sellers, buyers, testMode, note });
  const testMode = !!s.scheduled?.schedule.testMode;
  if (!s.published) {
    if (s.scheduled) return out('scheduled', false, false, `v${s.scheduled.number} goes live for sellers on ${fmt(s.scheduled.schedule.sellerGoLive)}.${testMode ? ' Test accounts can see it now.' : ''}`, testMode);
    return out('never_live', false, false, 'No version has been approved yet.');
  }
  const sch = s.published.schedule;
  let sellers = true;
  let buyers = !!sch && sch.buyerGoLive <= s.today && s.catalogs >= sch.minCatalogs;
  let key: StatusKey = buyers ? 'live' : 'live_for_sellers';
  let note = buyers
    ? `v${s.published.number} is live for sellers and buyers.`
    : sch && sch.buyerGoLive > s.today
      ? `Buyers from ${fmt(sch.buyerGoLive)}.`
      : sch
        ? `Buyers wait for ${sch.minCatalogs} catalog${sch.minCatalogs === 1 ? '' : 's'} (${s.catalogs} so far).`
        : 'Buyer go-live is not set.';
  if (s.override && s.override.status !== 'active') {
    const until = s.override.endsAt ? ` until ${s.override.endsAt.toISOString().slice(0, 16).replace('T', ' ')} UTC` : '';
    if (s.override.status === 'deactivated' || s.override.status === 'maintenance') {
      sellers = false;
      buyers = false;
    } else if (s.override.status === 'down_for_buyers') buyers = false;
    else if (s.override.status === 'down_for_sellers') sellers = false;
    key = s.override.status;
    note = `${s.override.reason}${until}.`;
  }
  if (s.scheduled) note += ` v${s.scheduled.number} replaces it on ${fmt(s.scheduled.schedule.sellerGoLive)}.`;
  return out(key, sellers, buyers, note.trim(), testMode);
}
