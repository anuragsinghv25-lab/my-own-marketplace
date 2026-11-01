'use client';

import { Checkbox, Field, Input } from '@orbita/ui';

export interface ScheduleValue {
  sellerGoLive: string;
  buyerGoLive: string;
  minCatalogs: number;
  testMode: boolean;
}

export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Next Monday after the given date (a common buyer go-live). */
export const nextMonday = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, ((8 - d) % 7) || 7);
};

/** Seller and buyer go-live, the catalog threshold and test mode: shared by approval and rescheduling. */
export function ScheduleFields({ value, onChange, today, sellerLocked }: { value: ScheduleValue; onChange: (v: ScheduleValue) => void; today: string; sellerLocked?: boolean }) {
  const buyerBefore = value.buyerGoLive < value.sellerGoLive;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sellers from" htmlFor="sch-seller" hint={sellerLocked ? 'Sellers already have it.' : value.sellerGoLive === today ? 'Today: goes live on approval.' : undefined}>
          <Input id="sch-seller" type="date" min={today} value={value.sellerGoLive} disabled={sellerLocked} onChange={(e) => onChange({ ...value, sellerGoLive: e.target.value, buyerGoLive: e.target.value > value.buyerGoLive ? e.target.value : value.buyerGoLive })} />
        </Field>
        <Field label="Buyers from" htmlFor="sch-buyer" error={buyerBefore ? 'Buyers cannot go live before sellers.' : undefined} hint={!buyerBefore ? 'Sellers first, so catalogs exist when buyers arrive.' : undefined}>
          <Input id="sch-buyer" type="date" min={value.sellerGoLive} value={value.buyerGoLive} onChange={(e) => onChange({ ...value, buyerGoLive: e.target.value })} />
        </Field>
      </div>
      <Field label="Buyers also wait for this many catalogs" htmlFor="sch-min" hint="0 = the date alone decides. Catalogs are counted once sellers can list (R5).">
        <Input id="sch-min" type="number" min={0} max={10000} value={value.minCatalogs} onChange={(e) => onChange({ ...value, minCatalogs: Math.max(0, Number(e.target.value) || 0) })} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={value.testMode} onChange={(e) => onChange({ ...value, testMode: e.target.checked })} className="mt-0.5" />
        <span>
          <span className="font-medium">Test mode before go-live</span>
          <span className="block text-mute text-xs">Designated test sellers and buyers can see the category early.</span>
        </span>
      </label>
    </div>
  );
}
