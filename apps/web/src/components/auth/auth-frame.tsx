import { CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { OrbitaWordmark } from '@orbita/ui';

/** Split-screen frame for sign-in pages: brand story on the left, the form on the right. */
export function AuthFrame({ children, marketplace }: { children: React.ReactNode; marketplace: string }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-accent to-ai p-12 text-onaccent">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full border border-white/15" aria-hidden />
        <div className="absolute -right-6 top-20 h-56 w-56 rounded-full border border-white/10" aria-hidden />
        <div className="relative inline-flex items-center gap-2.5">
          <span className="h-9 w-9 rounded-xl bg-white/15 grid place-items-center">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="3.2" fill="currentColor" />
              <ellipse cx="12" cy="12" rx="9" ry="4" stroke="currentColor" strokeWidth="1.6" transform="rotate(-28 12 12)" />
            </svg>
          </span>
          <span className="text-[17px] font-semibold tracking-tight">{marketplace}</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight leading-tight">
            Define categories once. List products in minutes. Review only what is risky.
          </h1>
          <ul className="mt-8 space-y-3 text-[15px] text-white/90">
            <li className="flex gap-3">
              <Sparkles size={18} className="mt-0.5 shrink-0" /> AI recommends: forms fill themselves from evidence.
            </li>
            <li className="flex gap-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0" /> {marketplace} validates against the category contract.
            </li>
            <li className="flex gap-3">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> Humans review exceptions, with every decision audited.
            </li>
          </ul>
        </div>
        <p className="relative text-xs text-white/70">Category · Brand · Catalog governance platform</p>
      </section>
      <section className="flex flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden mb-10">
          <OrbitaWordmark name={marketplace} />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[400px] animate-fade-in">{children}</div>
        </div>
      </section>
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'bad' | 'ok' | 'warn' | 'accent'; children: React.ReactNode }) {
  const cls = {
    bad: 'bg-bad/10 text-bad',
    ok: 'bg-ok/10 text-ok',
    warn: 'bg-warn/10 text-warn',
    accent: 'bg-accent/[.07] text-ink',
  }[tone];
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}
