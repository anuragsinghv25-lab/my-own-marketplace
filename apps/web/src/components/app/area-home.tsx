import { Rocket } from 'lucide-react';
import { Badge, Card, CardHeader, PageHeader } from '@orbita/ui';
import type { NavItem } from '@/lib/navigation';
import { NAV_ICONS } from '@/components/shell/icons';

/**
 * Home page of an area. In R0 the business features are not built yet, so each home shows
 * the user's roles and the features that will arrive here, by release.
 */
export function AreaHome({
  eyebrow,
  title,
  description,
  name,
  roles,
  upcoming,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  name: string;
  roles: string[];
  upcoming: (NavItem & { blurb: string })[];
  children?: React.ReactNode;
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-accent/[.07] px-4 py-3 text-sm animate-fade-in">
        <span>
          Signed in as <strong>{name}</strong>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {roles.map((r) => (
            <Badge key={r} tone="accent">
              {r}
            </Badge>
          ))}
        </span>
      </div>
      {children}
      {upcoming.length ? (
        <Card>
          <CardHeader
            title="Coming to this space"
            description="These features arrive in the next releases. Your menu already shows them so you know where they will live."
          />
          <ul className="divide-y divide-line border-t border-line">
            {upcoming.map((i) => {
              const Icon = NAV_ICONS[i.icon];
              return (
                <li key={i.href} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="h-9 w-9 shrink-0 rounded-xl bg-soft text-mute grid place-items-center">
                    <Icon size={17} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{i.label}</div>
                    <div className="text-xs text-mute mt-0.5">{i.blurb}</div>
                  </div>
                  <Badge tone="neutral" icon={<Rocket size={12} />}>
                    {i.release}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
