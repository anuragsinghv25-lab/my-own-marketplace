import { Badge, cn } from '@orbita/ui';
import type { ContractChange } from '@orbita/contract';

const KIND: Record<ContractChange['kind'], { label: string; bar: string; tone: 'ok' | 'bad' | 'warn' | 'neutral'; chip: string }> = {
  added: { label: 'Added', bar: 'bg-ok', tone: 'ok', chip: '' },
  removed: { label: 'Removed', bar: 'bg-bad', tone: 'bad', chip: '' },
  modified: { label: 'Changed', bar: 'bg-[#f59e0b]', tone: 'warn', chip: '' },
  state: { label: 'Importance', bar: 'bg-[#eab308]', tone: 'neutral', chip: 'bg-[#eab308]/15 text-[#a16207] dark:text-[#facc15]' },
};

const AREA: Record<ContractChange['area'], string> = {
  spec: 'Specifications',
  rule: 'Rules',
  flag: 'Flags',
  title: 'Product title',
  offer: 'Offer terms',
};

/** Colour key: green added, red removed, orange changed, yellow a change of standing (importance, required). */
export function ChangeLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-mute">
      {(Object.keys(KIND) as ContractChange['kind'][]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-full', KIND[k].bar)} />
          {k === 'state' ? 'Importance or required changed' : KIND[k].label}
        </span>
      ))}
    </div>
  );
}

export function ChangeList({ changes, empty }: { changes: ContractChange[]; empty: string }) {
  if (!changes.length) return <p className="px-5 py-6 text-sm text-mute">{empty}</p>;
  const areas = (Object.keys(AREA) as ContractChange['area'][]).filter((a) => changes.some((c) => c.area === a));
  return (
    <div className="divide-y divide-line">
      {areas.map((a) => (
        <section key={a} className="px-5 py-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-mute mb-2">
            {AREA[a]} <span className="normal-case tracking-normal">· {changes.filter((c) => c.area === a).length}</span>
          </h3>
          <ul className="space-y-1.5">
            {changes
              .filter((c) => c.area === a)
              .map((c, i) => (
                <li key={`${c.key}-${c.kind}-${i}`} className="flex gap-3 rounded-lg bg-soft/50 pr-3 overflow-hidden">
                  <span className={cn('w-1 shrink-0', KIND[c.kind].bar)} aria-hidden />
                  <div className="py-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{c.label}</span>
                      {c.kind === 'state' ? (
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', KIND.state.chip)}>{KIND.state.label}</span>
                      ) : (
                        <Badge tone={KIND[c.kind].tone}>{KIND[c.kind].label}</Badge>
                      )}
                    </div>
                    {c.details.length ? (
                      <ul className="mt-0.5 text-[13px] text-mute">
                        {c.details.map((d) => (
                          <li key={d} className="break-words">{d}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
