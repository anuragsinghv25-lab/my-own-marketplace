import Link from 'next/link';
import { cn } from '@orbita/ui';

/** Server-side tabs: each tab is a URL, so data loads on the server and tabs can be linked. */
export function TabLinks({ base, current, tabs }: { base: string; current: string; tabs: { key: string; label: string; count?: number }[] }) {
  return (
    <nav className="mb-4 inline-flex flex-wrap gap-1 rounded-xl bg-soft p-1" aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`${base}?tab=${t.key}`}
          aria-current={current === t.key ? 'page' : undefined}
          className={cn(
            'h-8 inline-flex items-center gap-1.5 rounded-lg px-3 text-sm transition-colors',
            current === t.key ? 'bg-card text-ink shadow-soft' : 'text-mute hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined ? <span className="text-[11px] text-mute">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
