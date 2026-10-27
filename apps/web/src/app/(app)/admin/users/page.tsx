import type { Metadata } from 'next';
import { ROLES, ROLE_KEYS, isRoleKey } from '@orbita/authz';
import { getDb } from '@orbita/db';
import { listUsers } from '@orbita/identity';
import { PageHeader } from '@orbita/ui';
import { UsersView, type RoleOption } from '@/components/app/users-view';
import { configStatus } from '@/server/env';
import { requestMeta } from '@/server/request';
import { requirePermission } from '@/server/session';

export const metadata: Metadata = { title: 'Users' };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requirePermission('read', 'RoleGrant');
  const sp = await searchParams;
  const status = ['invited', 'active', 'deactivated'].includes(sp.status ?? '') ? (sp.status as 'invited') : undefined;
  const role = isRoleKey(sp.role) ? sp.role : undefined;
  const ctx = { ...session, meta: await requestMeta() };
  const users = await listUsers({ db: getDb() }, ctx, { q: sp.q || undefined, status, role });
  const demoCount = (await listUsers({ db: getDb() }, ctx)).filter((u) => u.isDemo).length;

  const roleOptions: RoleOption[] = ROLE_KEYS.map((k) => ({
    key: k,
    label: ROLES[k].label,
    side: ROLES[k].side,
    description: ROLES[k].description,
    assignable: ROLES[k].assignable,
    conflictsWith: [...(ROLES[k].conflictsWith ?? [])],
  }));

  return (
    <>
      <PageHeader
        eyebrow="Admin console"
        title="Users"
        description="Invite people, give them roles and switch accounts off. Every change is recorded in the audit log."
      />
      <UsersView
        users={JSON.parse(JSON.stringify(users))}
        roles={roleOptions}
        filters={{ q: sp.q ?? '', status: status ?? '', role: role ?? '' }}
        canManage={session.ability.can('grant', 'RoleGrant')}
        emailConfigured={configStatus().email}
        currentUserId={session.actor.id}
        demoCount={demoCount}
      />
    </>
  );
}
