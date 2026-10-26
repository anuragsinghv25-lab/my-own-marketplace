import * as React from 'react';
import { cn } from '../cn';

/* ------------------------------------------------------------------ Button */

const buttonVariants = {
  primary: 'bg-accent text-onaccent hover:brightness-110 shadow-soft',
  secondary: 'bg-card text-ink border border-line hover:bg-soft',
  ghost: 'text-mute hover:text-ink hover:bg-soft',
  ai: 'bg-ai text-onaccent hover:brightness-110 shadow-soft',
  danger: 'bg-bad/10 text-bad hover:bg-bad/20',
} as const;
const buttonSizes = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2',
  icon: 'h-9 w-9 rounded-full',
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  loading?: boolean;
}

export const buttonClass = (variant: keyof typeof buttonVariants = 'primary', size: keyof typeof buttonSizes = 'md') =>
  cn(
    'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-150 active:scale-[.98] whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none',
    buttonVariants[variant],
    buttonSizes[size],
  );

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonClass(variant, size), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ Inputs */

const fieldBase =
  'w-full rounded-xl border border-line bg-card px-3.5 text-[15px] text-ink outline-none transition-shadow placeholder:text-mute/70 focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:opacity-60 aria-[invalid=true]:border-bad aria-[invalid=true]:focus:ring-bad/10';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, 'h-11', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, 'min-h-24 py-2.5', className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          fieldBase,
          'h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9',
          "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236e6e73' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn('h-4 w-4 rounded border-line accent-[rgb(var(--accent))] cursor-pointer', className)}
      {...props}
    />
  );
}

export function Radio({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="radio"
      className={cn('h-4 w-4 border-line accent-[rgb(var(--accent))] cursor-pointer', className)}
      {...props}
    />
  );
}

/** Label + control + hint/error, the pattern used under every prototype field. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
        {required ? <span className="text-bad"> *</span> : null}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1.5 text-xs text-bad" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-mute">{hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Badge / chips */

const tones = {
  neutral: 'bg-soft text-mute',
  accent: 'bg-accent/10 text-accent',
  ai: 'bg-ai/10 text-ai',
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/10 text-warn',
  bad: 'bg-bad/10 text-bad',
} as const;
export type Tone = keyof typeof tones;

export function Badge({
  tone = 'neutral',
  className,
  children,
  icon,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** AI confidence chip: always in the AI colour so machine values are recognisable. */
export function ConfidenceChip({ value, className }: { value: number; className?: string }) {
  const label = value >= 0.85 ? 'High confidence' : value >= 0.6 ? 'Review recommended' : 'Seller confirmation required';
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full bg-ai/10 px-2.5 py-1 text-xs font-medium text-ai', className)}>
      <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-ai/20">
        <span className="absolute inset-y-0 left-0 rounded-full bg-ai" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ Card */

export function Card({
  className,
  children,
  raised,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div
      className={cn('rounded-2xl border border-line bg-card', raised ? 'shadow-lift' : 'shadow-soft', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div>
        <h2 className="font-semibold text-lg tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-mute mt-0.5">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Page header */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="text-xs font-medium uppercase tracking-wider text-mute">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight mt-0.5">{title}</h1>
        {description ? <p className="text-sm text-mute mt-1 max-w-2xl">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Empty state + skeleton */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('px-6 py-12 text-center', className)}>
      {icon ? (
        <div className="mx-auto h-14 w-14 rounded-2xl bg-accent/10 text-accent grid place-items-center mb-4">{icon}</div>
      ) : null}
      <div className="font-semibold text-lg tracking-tight">{title}</div>
      {description ? <p className="text-sm text-mute mt-1.5 max-w-md mx-auto">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg bg-[linear-gradient(90deg,rgb(var(--soft))_25%,rgb(var(--line))_37%,rgb(var(--soft))_63%)] bg-[length:400%_100%] animate-shimmer',
        className,
      )}
    />
  );
}

/* ------------------------------------------------------------------ Avatar */

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials =
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || '?';
  return (
    <span
      className={cn(
        'h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-accent to-ai text-onaccent grid place-items-center text-sm font-semibold',
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/* ------------------------------------------------------------------ Table */

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="text-left text-[11px] uppercase tracking-wider text-mute border-b border-line">{children}</tr>
    </thead>
  );
}
export function TH({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn('px-4 py-2.5 font-medium', className)}>{children}</th>;
}
export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}
export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn('hover:bg-soft/60 transition-colors', className)}>{children}</tr>;
}
export function TD({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <td className={cn('px-4 py-3 align-middle', className)} colSpan={colSpan}>
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------ Stepper */

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                'h-7 w-7 rounded-full grid place-items-center text-xs font-semibold',
                state === 'done' && 'bg-ok/10 text-ok',
                state === 'current' && 'bg-accent text-onaccent',
                state === 'todo' && 'bg-soft text-mute',
              )}
            >
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span className={cn(state === 'current' ? 'font-medium' : 'text-mute')}>{s}</span>
            {i < steps.length - 1 ? <span className="h-px w-6 bg-line" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ Check item (3 severities) */

export function CheckItem({
  severity,
  title,
  children,
}: {
  severity: 'blocking' | 'recommended' | 'passed';
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  const tone = severity === 'blocking' ? 'text-bad bg-bad/10' : severity === 'recommended' ? 'text-warn bg-warn/10' : 'text-ok bg-ok/10';
  const mark = severity === 'blocking' ? '!' : severity === 'recommended' ? '•' : '✓';
  return (
    <div className="flex gap-3 rounded-xl bg-soft p-3.5">
      <span className={cn('h-6 w-6 shrink-0 rounded-full grid place-items-center text-xs font-bold', tone)}>{mark}</span>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {children ? <div className="text-xs text-mute mt-0.5">{children}</div> : null}
      </div>
    </div>
  );
}
