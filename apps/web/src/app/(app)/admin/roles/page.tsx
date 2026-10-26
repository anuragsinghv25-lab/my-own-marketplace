import type { Metadata } from 'next';
import Link from 'next/link';
import { AREAS, ROLES, ROLE_KEYS } from '@orbita/authz';
import { getDb } from '@orbita/db';
import { roleMemberCounts } from '@orbita/identity';
import { Badge, Card, PageHeader } from '@orbita/ui';
import { permissionsOf } from '@/lib/role-permissions';
import { requestMeta } from '@/server/request';
import { requirePermission } from '@/server/session';

export const metadata: Metadata = { title: 'Roles' };

export default async function RolesPage() {
  const session = await requirePermission('read', 'RoleGrant');
  const counts = await roleMemberCounts({ db: getDb() }, { ...session, meta: await requestMeta() });

  return (
    <>
      <PageHeader
        eyebrow="Admin console"
        title="Roles"
        description="Roles are defined in code with their permissions; you decide who holds them. Permissions below are generated from the live rules."
      />
      {(['platform', 'seller'] as const).map((side) => (
        <section key={side} className="mb-8">
          <h2 className="text-xs font-medium uppercase tracking-wider text-mute mb-3">{side === 'platform' ? 'Platform roles' : 'Seller roles'}</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {ROLE_KEYS.filter((k) => ROLES[k].side === side).map((k) => {
              const r = ROLES[k];
              return (
                <Card key={k} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{r.label}</div>
                      <code className="text-[11px] text-mute">{k}</code>
                    </div>
                    <Link href={`/admin/users?role=${k}`} className="shrink-0">
                      <Badge tone={counts[k] ? 'accent' : 'neutral'}>
                        {counts[k]} {counts[k] === 1 ? 'member' : 'members'}
                      </Badge>
                    </Link>
                  </div>
                  <p className="text-sm text-mute mt-2">{r.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge tone="neutral">Home: {AREAS[r.home].label}</Badge>
                    <Badge tone="neutral">Scope: {r.scopes.join(' / ')}</Badge>
                    {!r.assignable ? <Badge tone="ai">Assigned automatically</Badge> : null}
                    {r.conflictsWith?.length ? (
                      <Badge tone="warn" className="whitespace-normal">
                        Not with: {r.conflictsWith.length > 4 ? 'any other role' : r.conflictsWith.map((c) => ROLES[c].label).join(', ')}
                      </Badge>
                    ) : null}
                  </div>
                  <details className="mt-3 group">
                    <summary className="cursor-pointer text-xs text-accent font-medium">Permissions</summary>
                    <ul className="mt-2 space-y-1 text-xs text-mute">
                      {permissionsOf(k).map((p) => (
                        <li key={p} className="rounded-md bg-soft px-2 py-1">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </details>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
