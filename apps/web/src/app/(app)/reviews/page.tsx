import type { Metadata } from 'next';
import { AreaHome } from '@/components/app/area-home';
import { upcomingFor } from '@/lib/upcoming';
import { requirePermission, roleLabels } from '@/server/session';

export const metadata: Metadata = { title: 'Review desk' };

export default async function Page() {
  const session = await requirePermission('access', 'ReviewDesk');
  return (
    <AreaHome
      eyebrow="Review desk"
      title={`Welcome, ${session.actor.fullName.split(' ')[0] || 'there'}`}
      description="Your queues of vendor assessments, brand requests, catalog reviews and escalations."
      name={session.actor.fullName || session.actor.email}
      roles={roleLabels(session.roles)}
      upcoming={upcomingFor(session.ability, 'ReviewDesk')}
    />
  );
}
