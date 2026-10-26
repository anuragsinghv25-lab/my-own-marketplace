import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, MailPlus, ScrollText, ShieldCheck, UserCheck, Users, UserX } from 'lucide-react';
import { listAuditEvents } from '@orbita/audit';
import { getDb } from '@orbita/db';
import { listUsers } from '@orbita/identity';
import { Card, CardHeader, EmptyState } from '@orbita/ui';
import { AreaHome } from '@/components/app/area-home';
import { AuditFeed } from '@/components/app/audit-list';
import { upcomingFor } from '@/lib/upcoming';
import { requestMeta } from '@/server/request';
import { requirePermission, roleLabels } from '@/server/session';

export const metadata: Metadata = { title: 'Admin console' };

function Stat({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href: string }) {
  return (
    <Link href={href} className="group rounded-2xl border border-line bg-card p-4 shadow-soft hover:shadow-lift transition-shadow">
      <div className="flex items-center justify-between">
        <span className="h-9 w-9 rounded-xl bg-accent/10 text-accent grid place-items-center">{icon}</span>
        <ArrowRight size={16} className="text-mute opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-xs text-mute">{label}</div>
    </Link>
  );
}

export default async function AdminHome() {
  const session = await requirePermission('access', 'AdminConsole');
  const ctx = { ...session, meta: await requestMeta() };
  const canUsers = session.ability.can('read', 'RoleGrant');
  const canAudit = session.ability.can('read', 'AuditEvent');
  const users = canUsers ? await listUsers({ db: getDb() }, ctx) : [];
  const audit = canAudit ? await listAuditEvents(getDb(), session.ability, { limit: 8 }) : null;

  return (
    <AreaHome
      eyebrow="Admin console"
      title={`Welcome, ${session.actor.fullName.split(' ')[0] || 'there'}`}
      description="Users, roles and the audit trail. Libraries and workgroups arrive in R1."
      name={session.actor.fullName || session.actor.email}
      roles={roleLabels(session.roles)}
      upcoming={upcomingFor(session.ability, 'AdminConsole')}
    >
      {canUsers ? (
        <div className="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={<Users size={17} />} label="Users" value={users.length} href="/admin/users" />
          <Stat icon={<UserCheck size={17} />} label="Active" value={users.filter((u) => u.status === 'active').length} href="/admin/users?status=active" />
          <Stat icon={<MailPlus size={17} />} label="Invited, not joined" value={users.filter((u) => u.status === 'invited').length} href="/admin/users?status=invited" />
          <Stat icon={<UserX size={17} />} label="Deactivated" value={users.filter((u) => u.status === 'deactivated').length} href="/admin/users?status=deactivated" />
        </div>
      ) : null}
      {audit ? (
        <Card className="mb-4">
          <CardHeader
            title="Recent activity"
            description="The latest entries in the audit trail."
            actions={
              <Link href="/admin/audit" className="inline-flex items-center gap-1 text-sm text-accent font-medium hover:underline">
                Open audit log <ArrowRight size={14} />
              </Link>
            }
          />
          <div className="border-t border-line">
            {audit.items.length ? (
              <AuditFeed items={audit.items} />
            ) : (
              <EmptyState icon={<ScrollText size={22} />} title="Nothing yet" description="Changes to users and roles will show up here." />
            )}
          </div>
        </Card>
      ) : null}
      {canUsers ? (
        <Card className="mb-4 p-5 flex flex-wrap items-center gap-4">
          <span className="h-11 w-11 rounded-2xl bg-accent text-onaccent grid place-items-center shrink-0">
            <ShieldCheck size={20} />
          </span>
          <div className="flex-1 min-w-[220px]">
            <div className="font-semibold">Separation of duties is on</div>
            <p className="text-sm text-mute mt-0.5">
              Platform admins cannot hold approval roles, auditors cannot hold any other role, and nobody approves what they edited.
            </p>
          </div>
          <Link href="/admin/roles" className="text-sm text-accent font-medium hover:underline inline-flex items-center gap-1">
            See roles <ArrowRight size={14} />
          </Link>
        </Card>
      ) : null}
    </AreaHome>
  );
}
