import type { Metadata } from 'next';
import { AreaHome } from '@/components/app/area-home';
import { upcomingFor } from '@/lib/upcoming';
import { requirePermission, roleLabels } from '@/server/session';

export const metadata: Metadata = { title: 'Seller app' };

export default async function Page() {
  const session = await requirePermission('access', 'SellerApp');
  return (
    <AreaHome
      eyebrow="Seller app"
      title={`Welcome, ${session.actor.fullName.split(' ')[0] || 'there'}`}
      description="Manage your brands, catalogs and offers."
      name={session.actor.fullName || session.actor.email}
      roles={roleLabels(session.roles)}
      upcoming={upcomingFor(session.ability, 'SellerApp')}
    />
  );
}
