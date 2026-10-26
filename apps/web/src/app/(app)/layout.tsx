import { AppShell } from '@/components/shell/app-shell';
import { navigationFor } from '@/lib/navigation';
import { env } from '@/server/env';
import { requireSession, roleLabels } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <AppShell
      marketplace={env.marketplaceName()}
      user={{ name: session.actor.fullName, email: session.actor.email, roleLabels: roleLabels(session.roles) }}
      sections={navigationFor(session.ability)}
    >
      {children}
    </AppShell>
  );
}
