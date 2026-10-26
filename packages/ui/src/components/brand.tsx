import { cn } from '../cn';

/** The Orbita mark: a planet with an orbit, in accent → AI gradient. */
export function OrbitaMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-accent to-ai text-onaccent grid place-items-center',
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <circle cx="12" cy="12" r="3.2" fill="currentColor" />
        <ellipse cx="12" cy="12" rx="9" ry="4" stroke="currentColor" strokeWidth="1.6" transform="rotate(-28 12 12)" />
      </svg>
    </span>
  );
}

export function OrbitaWordmark({ name = 'Orbita', className }: { name?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <OrbitaMark />
      <span className="text-[17px] font-semibold tracking-tight">{name}</span>
    </span>
  );
}
