import type { Contract, FieldDef } from '@orbita/contract';
import { Badge } from '@orbita/ui';

const IMPORTANCE: Record<FieldDef['importance'], { label: string; tone: 'accent' | 'warn' | 'ok' | 'neutral' }> = {
  key: { label: 'Key', tone: 'accent' },
  required: { label: 'Required', tone: 'warn' },
  recommended: { label: 'Recommended', tone: 'ok' },
  optional: { label: 'Optional', tone: 'neutral' },
};

function limits(f: FieldDef) {
  const u = f.unit ? ` ${f.unit.symbol}` : '';
  const parts: string[] = [];
  if (f.min !== undefined && f.max !== undefined) parts.push(`${f.min} to ${f.max}${u}`);
  else if (f.min !== undefined) parts.push(`at least ${f.min}${u}`);
  else if (f.max !== undefined) parts.push(`at most ${f.max}${u}`);
  else if (u) parts.push(u.trim());
  if (f.step) parts.push(`steps of ${f.step}`);
  if (f.options?.length) parts.push(f.options.length <= 4 ? f.options.map((o) => o.value).join(', ') : `${f.options.length} values`);
  return parts.join(' · ');
}

/** The submitted contract as a reviewer reads it: what sellers will be asked, the rules in words, the offer terms. */
export function ContractSummary({ contract, commented }: { contract: Contract; commented: Map<string, number> }) {
  const o = contract.offer;
  const offer: [string, string][] = [
    ['Selling units', o.sellingUnits.join(', ') || '—'],
    ['Discount off MRP', o.discountBand ? `${o.discountBand.min}% to ${o.discountBand.max}%` : 'Any'],
    ['Images', o.maxImages ? `up to ${o.maxImages}` : 'Default'],
    ['Video', o.videoAllowed ? 'Allowed' : 'Not allowed'],
    ['Country of origin', o.countryOfOriginRequired ? 'Required' : 'Optional'],
    ['Certificates', o.certificatesRequired ? 'Required' : 'Not required'],
    ['Who may sell', o.allowedSellers ? o.allowedSellers.replaceAll('_', ' ') : 'Anyone'],
  ];
  return (
    <div className="divide-y divide-line">
      {contract.groups.map((g) => (
        <section key={g} className="px-5 py-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-mute mb-1.5">{g}</h3>
          <ul className="divide-y divide-line/60">
            {contract.fields
              .filter((f) => f.group === g)
              .map((f) => (
                <li key={f.key} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-sm font-medium min-w-36">{f.label}</span>
                  <Badge tone={IMPORTANCE[f.importance].tone}>{IMPORTANCE[f.importance].label}</Badge>
                  {f.variantOption ? <Badge tone="ai">Variant</Badge> : null}
                  {f.filterable ? <Badge>Filter</Badge> : null}
                  <span className="text-[13px] text-mute">{limits(f)}</span>
                  {commented.get(f.key) ? <Badge tone="warn">{commented.get(f.key)} comment{commented.get(f.key) === 1 ? '' : 's'}</Badge> : null}
                </li>
              ))}
          </ul>
        </section>
      ))}
      <section className="px-5 py-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-mute mb-1.5">Rules · {contract.rules.length}</h3>
        {contract.rules.length ? (
          <ol className="space-y-1.5 list-decimal pl-5 text-sm">
            {contract.rules.map((r) => (
              <li key={r.id}>
                {r.name ? <span className="font-medium">{r.name}: </span> : null}
                {r.text}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-mute">No rules.</p>
        )}
      </section>
      <section className="px-5 py-3 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-mute mb-1.5">Product title</h3>
          <code className="text-sm break-words">{contract.titleTemplate || '—'}</code>
          <p className="text-xs text-mute mt-1">At most {contract.titleMaxLength} characters.</p>
        </div>
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-mute mb-1.5">Offer terms</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
            {offer.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-mute">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
