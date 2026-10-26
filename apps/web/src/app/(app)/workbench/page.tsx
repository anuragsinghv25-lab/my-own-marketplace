import type { Metadata } from 'next';
import { AreaHome } from '@/components/app/area-home';
import { upcomingFor } from '@/lib/upcoming';
import { requirePermission, roleLabels } from '@/server/session';

export const metadata: Metadata = { title: 'Category workbench' };

export default async function Page() {
  const session = await requirePermission('access', 'Workbench');
  return (
    <AreaHome
      eyebrow="Category workbench"
      title={`Welcome, ${session.actor.fullName.split(' ')[0] || 'there'}`}
      description="Configure categories, their specifications and rules, and move them through review to publication."
      name={session.actor.fullName || session.actor.email}
      roles={roleLabels(session.roles)}
      upcoming={upcomingFor(session.ability, 'Workbench')}
    />
  );
}
