import { getDb } from '@orbita/db';
import { listNotifications } from '@orbita/notifications';
import { AppShell } from '@/components/shell/app-shell';
import { plain } from '@/lib/plain';
import { navigationFor } from '@/lib/navigation';
import { env } from '@/server/env';
import { requireSession, roleLabels } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const notifications = await listNotifications(getDb(), session.actor).catch(() => undefined);
  return (
    <AppShell
      marketplace={env.marketplaceName()}
      user={{ name: session.actor.fullName, email: session.actor.email, roleLabels: roleLabels(session.roles) }}
      sections={navigationFor(session.ability)}
      notifications={notifications ? plain(notifications) : undefined}
    >
      {children}
    </AppShell>
  );
}
