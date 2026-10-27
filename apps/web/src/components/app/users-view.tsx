'use client';

import { useActionState, useMemo, useState, useTransition } from 'react';
import { Copy, FlaskConical, KeyRound, MailPlus, Plus, RefreshCw, Search, ShieldOff, UserCheck, UserPlus, Users, X } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  Drawer,
  EmptyState,
  Field,
  Input,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  toast,
  type Tone,
} from '@orbita/ui';
import {
  grantRoleAction,
  inviteUserAction,
  rebuildDemoTeamAction,
  resendInviteAction,
  revokeRoleAction,
  setActiveAction,
  setAllDemoPasswordsAction,
  setDemoPasswordAction,
} from '@/app/(app)/admin/users/actions';
import { idle, type ActionState } from '@/lib/action-state';
import { formatDateTime, timeAgo } from '@/lib/format';

export interface RoleOption {
  key: string;
  label: string;
  side: 'platform' | 'seller';
  description: string;
  assignable: boolean;
  conflictsWith: string[];
}

interface Grant {
  id: string;
  role: string;
  roleLabel: string;
  scopeType: string;
  scopeId: string | null;
  grantedAt: string;
}

export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  kind: 'staff' | 'seller';
  status: 'invited' | 'active' | 'deactivated';
  isDemo: boolean;
  invitedAt: string | null;
  activatedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  grants: Grant[];
}

const STATUS: Record<UserRow['status'], { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'ok' },
  invited: { label: 'Invited', tone: 'warn' },
  deactivated: { label: 'Deactivated', tone: 'bad' },
};

const conflicts = (roles: RoleOption[], a: string, b: string) => {
  const ra = roles.find((r) => r.key === a);
  const rb = roles.find((r) => r.key === b);
  return Boolean(ra?.conflictsWith.includes(b) || rb?.conflictsWith.includes(a));
};

function notify(s: ActionState) {
  if (s.status === 'ok') toast.success(s.message ?? 'Done');
  else if (s.status === 'error') toast.error(s.message);
}

export function UsersView({
  users,
  roles,
  filters,
  canManage,
  emailConfigured,
  currentUserId,
  demoCount,
}: {
  users: UserRow[];
  roles: RoleOption[];
  filters: { q: string; status: string; role: string };
  canManage: boolean;
  emailConfigured: boolean;
  currentUserId: string;
  /** demo accounts in the whole system (not just the filtered list) */
  demoCount: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = users.find((u) => u.id === selectedId) ?? null;

  return (
    <>
      {canManage ? <DemoAccountsPanel count={demoCount} /> : null}
      <Card>
        <form className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line" role="search">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <Input name="q" defaultValue={filters.q} placeholder="Search name or email" className="h-10 pl-9" aria-label="Search users" />
          </div>
          <Select name="status" defaultValue={filters.status} className="h-10 w-40" aria-label="Status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="deactivated">Deactivated</option>
          </Select>
          <Select name="role" defaultValue={filters.role} className="h-10 w-52" aria-label="Role">
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
          {canManage ? <InviteDialog roles={roles} emailConfigured={emailConfigured} /> : null}
        </form>

        {users.length === 0 ? (
          <EmptyState icon={<Users size={22} />} title="No users match" description="Try a different search or clear the filters." />
        ) : (
          <Table>
            <THead>
              <TH>User</TH>
              <TH>Roles</TH>
              <TH>Status</TH>
              <TH className="hidden md:table-cell">Last seen</TH>
            </THead>
            <TBody>
              {users.map((u) => (
                <TR key={u.id} className="cursor-pointer">
                  <TD>
                    <button type="button" onClick={() => setSelectedId(u.id)} className="flex items-center gap-3 text-left">
                      <Avatar name={u.fullName || u.email} className="h-8 w-8 text-xs" />
                      <span className="min-w-0">
                        <span className="block font-medium truncate">
                          {u.fullName || '—'}
                          {u.id === currentUserId ? <span className="text-mute font-normal"> (you)</span> : null}
                          {u.isDemo ? (
                            <Badge tone="ai" className="ml-1.5 px-2 py-0 text-[10px] align-middle">
                              Demo
                            </Badge>
                          ) : null}
                        </span>
                        <span className="block text-xs text-mute truncate">{u.email}</span>
                      </span>
                    </button>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {u.grants.length ? (
                        u.grants.map((g) => (
                          <Badge key={g.id} tone="accent" className="px-2 py-0.5 text-[11px]">
                            {g.roleLabel}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-mute">No roles</span>
                      )}
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={STATUS[u.status].tone}>{STATUS[u.status].label}</Badge>
                  </TD>
                  <TD className="hidden md:table-cell text-xs text-mute">{timeAgo(u.lastSeenAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {selected ? (
        <UserDrawer
          key={selected.id}
          user={selected}
          roles={roles}
          canManage={canManage}
          isSelf={selected.id === currentUserId}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------- invite */

function RolePicker({ roles, chosen, onToggle }: { roles: RoleOption[]; chosen: string[]; onToggle: (k: string) => void }) {
  const groups: { title: string; side: RoleOption['side'] }[] = [
    { title: 'Platform roles', side: 'platform' },
    { title: 'Seller roles', side: 'seller' },
  ];
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <fieldset key={g.side}>
          <legend className="text-xs font-medium uppercase tracking-wider text-mute mb-2">{g.title}</legend>
          <div className="grid sm:grid-cols-2 gap-2">
            {roles
              .filter((r) => r.side === g.side && r.assignable)
              .map((r) => {
                const blockedBy = chosen.find((c) => c !== r.key && conflicts(roles, c, r.key));
                const checked = chosen.includes(r.key);
                return (
                  <label
                    key={r.key}
                    className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                      checked ? 'border-accent bg-accent/[.06]' : 'border-line hover:border-accent/40'
                    } ${blockedBy ? 'opacity-50' : 'cursor-pointer'}`}
                    title={blockedBy ? `Cannot be combined with ${roles.find((x) => x.key === blockedBy)?.label}` : r.description}
                  >
                    <Checkbox
                      name="roles"
                      value={r.key}
                      checked={checked}
                      disabled={Boolean(blockedBy)}
                      onChange={() => onToggle(r.key)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{r.label}</span>
                      <span className="block text-xs text-mute line-clamp-2">{r.description}</span>
                    </span>
                  </label>
                );
              })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function ManualLink({ url }: { url: string }) {
  return (
    <div className="rounded-xl bg-warn/10 p-3.5 text-sm">
      <div className="font-medium text-warn mb-1.5">Share this one-time link with the person</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate text-xs">{url}</code>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Link copied'))}
        >
          <Copy size={14} /> Copy
        </Button>
      </div>
      <p className="text-xs text-mute mt-1.5">Connect Resend (RESEND_API_KEY) to email invites automatically.</p>
    </div>
  );
}

function InviteDialog({ roles, emailConfigured }: { roles: RoleOption[]; emailConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [state, action, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const s = await inviteUserAction(prev, form);
    if (s.status === 'ok' && !s.data?.manualLink) {
      toast.success(s.message ?? 'Invite sent');
      setOpen(false);
      setChosen([]);
      return idle;
    }
    return s;
  }, idle);
  const manualLink = state.status === 'ok' ? (state.data?.manualLink as string | null) : null;

  const err = (k: string) => (state.status === 'error' ? state.fieldErrors?.[k]?.[0] : undefined);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setChosen([]);
      }}
      trigger={
        <Button className="ml-auto">
          <UserPlus size={16} /> Invite user
        </Button>
      }
      title="Invite a user"
      description={emailConfigured ? 'They get an email with a link to set their password.' : 'Email is not connected yet: you will get a link to share.'}
      className="w-[min(680px,calc(100vw-2rem))]"
    >
      {manualLink ? (
        <div className="space-y-4">
          <p className="text-sm">
            <strong>{String(state.status === 'ok' ? state.data?.email : '')}</strong> has been invited.
          </p>
          <ManualLink url={manualLink} />
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Full name" htmlFor="inv-name" error={err('fullName')}>
              <Input id="inv-name" name="fullName" required autoComplete="off" />
            </Field>
            <Field label="Work email" htmlFor="inv-email" error={err('email')}>
              <Input id="inv-email" name="email" type="email" required autoComplete="off" />
            </Field>
          </div>
          <RolePicker roles={roles} chosen={chosen} onToggle={(k) => setChosen((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))} />
          <p className="text-xs text-mute">
            Category roles are granted platform-wide until workgroups arrive in R1. Seller roles are attached to the demo
            organisation until seller onboarding arrives in R4.
          </p>
          {state.status === 'error' ? <div className="rounded-xl bg-bad/10 p-3 text-sm text-bad">{state.message}</div> : null}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={chosen.length === 0}>
              <MailPlus size={16} /> Send invite
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/* ---------------------------------------------------------------- user drawer */

function UserDrawer({
  user,
  roles,
  canManage,
  isSelf,
  onClose,
}: {
  user: UserRow;
  roles: RoleOption[];
  canManage: boolean;
  isSelf: boolean;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [addRole, setAddRole] = useState('');
  const [manualLink, setManualLink] = useState<string | null>(null);
  const held = user.grants.map((g) => g.role);
  const grantable = useMemo(
    () => roles.filter((r) => r.assignable && !held.includes(r.key) && !held.some((h) => conflicts(roles, h, r.key))),
    [roles, held],
  );

  const act = (fn: () => Promise<ActionState>) =>
    start(async () => {
      const s = await fn();
      notify(s);
      if (s.status === 'ok' && s.data?.manualLink) setManualLink(String(s.data.manualLink));
    });

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={user.fullName || user.email}
      description={user.email}
      width={520}
      footer={
        canManage && !isSelf ? (
          user.status === 'deactivated' ? (
            <Button variant="secondary" loading={pending} onClick={() => act(() => setActiveAction(user.id, true))}>
              <UserCheck size={16} /> Reactivate
            </Button>
          ) : (
            <Button variant="danger" loading={pending} onClick={() => act(() => setActiveAction(user.id, false))}>
              <ShieldOff size={16} /> Deactivate
            </Button>
          )
        ) : null
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-soft p-3">
            <div className="text-xs text-mute">Status</div>
            <div className="mt-1">
              <Badge tone={STATUS[user.status].tone}>{STATUS[user.status].label}</Badge>
            </div>
          </div>
          <div className="rounded-xl bg-soft p-3">
            <div className="text-xs text-mute">Type</div>
            <div className="mt-1 font-medium capitalize">{user.kind}</div>
          </div>
          <div className="rounded-xl bg-soft p-3">
            <div className="text-xs text-mute">Invited</div>
            <div className="mt-1">{formatDateTime(user.invitedAt)}</div>
          </div>
          <div className="rounded-xl bg-soft p-3">
            <div className="text-xs text-mute">Last seen</div>
            <div className="mt-1">{timeAgo(user.lastSeenAt)}</div>
          </div>
        </div>

        {user.isDemo && canManage ? <DemoPasswordForm userId={user.id} email={user.email} /> : null}

        {user.status === 'invited' && canManage ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-warn/10 px-4 py-3 text-sm">
              <span className="text-warn">Has not accepted the invite yet.</span>
              <Button size="sm" variant="secondary" loading={pending} onClick={() => act(() => resendInviteAction(user.id))}>
                Resend invite
              </Button>
            </div>
            {manualLink ? <ManualLink url={manualLink} /> : null}
          </div>
        ) : null}

        <section>
          <h3 className="font-semibold text-sm mb-2">Roles</h3>
          {user.grants.length === 0 ? <p className="text-sm text-mute">No roles. This person cannot open any area.</p> : null}
          <ul className="space-y-2">
            {user.grants.map((g) => (
              <li key={g.id} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{g.roleLabel}</div>
                  <div className="text-xs text-mute">
                    {g.scopeType === 'global' ? 'Platform-wide' : `${g.scopeType} scope`} · since {formatDateTime(g.grantedAt)}
                  </div>
                </div>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Revoke ${g.roleLabel}`}
                    loading={pending}
                    onClick={() => act(() => revokeRoleAction(user.id, g.id))}
                  >
                    <X size={15} /> Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {canManage && user.status !== 'deactivated' ? (
            <div className="mt-3 flex gap-2">
              <Select value={addRole} onChange={(e) => setAddRole(e.target.value)} className="h-10" aria-label="Role to grant">
                <option value="">Add a role…</option>
                {grantable.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </Select>
              <Button
                variant="secondary"
                disabled={!addRole}
                loading={pending}
                onClick={() =>
                  act(async () => {
                    const s = await grantRoleAction(user.id, addRole);
                    if (s.status === 'ok') setAddRole('');
                    return s;
                  })
                }
              >
                <Plus size={16} /> Grant
              </Button>
            </div>
          ) : null}
          {canManage ? (
            <p className="text-xs text-mute mt-2">
              Combinations that break separation of duties are not offered. Changes apply on the user&apos;s next request.
            </p>
          ) : null}
        </section>
      </div>
    </Drawer>
  );
}

/* ---------------------------------------------------------------- demo accounts */

function DemoPasswordForm({ userId, email }: { userId: string; email: string }) {
  const [password, setPassword] = useState('');
  const [pending, start] = useTransition();
  return (
    <section className="rounded-xl border border-ai/30 bg-ai/[.05] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound size={15} className="text-ai" /> Set password
      </div>
      <p className="text-xs text-mute mt-0.5 mb-3">
        Demo account: you can set its password directly. Real accounts always reset their own.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const s = await setDemoPasswordAction(userId, password);
            notify(s);
            if (s.status === 'ok') setPassword('');
          });
        }}
      >
        <Input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          autoComplete="off"
          aria-label={`New password for ${email}`}
          className="h-10"
        />
        <Button type="submit" variant="secondary" loading={pending} disabled={password.length < 10}>
          Set
        </Button>
      </form>
      <p className="text-[11px] text-mute mt-1.5">At least 10 characters, with a letter and a number.</p>
    </section>
  );
}

function DemoAccountsPanel({ count }: { count: number }) {
  const [pwState, pwAction, pwPending] = useActionState(async (prev: ActionState, form: FormData) => {
    const s = await setAllDemoPasswordsAction(prev, form);
    notify(s);
    return s;
  }, idle);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const [rbState, rbAction, rbPending] = useActionState(async (prev: ActionState, form: FormData) => {
    const s = await rebuildDemoTeamAction(prev, form);
    notify(s);
    if (s.status === 'ok') setRebuildOpen(false);
    return s;
  }, idle);

  return (
    <Card className="mb-4 p-5">
      <div className="flex flex-wrap items-start gap-4">
        <span className="h-11 w-11 rounded-2xl bg-ai/10 text-ai grid place-items-center shrink-0">
          <FlaskConical size={20} />
        </span>
        <div className="flex-1 min-w-[240px]">
          <div className="font-semibold">Demo accounts</div>
          <p className="text-sm text-mute mt-0.5">
            {count
              ? `${count} demo account${count === 1 ? '' : 's'} for walking through the flows. Give them one shared password, or rebuild the team.`
              : 'No demo accounts. Create the demo team to walk through every flow.'}
          </p>
          {count ? (
            <form action={pwAction} className="mt-3 flex flex-wrap gap-2">
              <Input
                name="password"
                type="text"
                placeholder="Password for all demo accounts"
                autoComplete="off"
                aria-label="Password for all demo accounts"
                className="h-10 max-w-xs"
                required
                minLength={10}
              />
              <Button type="submit" variant="secondary" loading={pwPending}>
                <KeyRound size={15} /> Set for all
              </Button>
            </form>
          ) : null}
          {pwState.status === 'error' ? <p className="mt-1.5 text-xs text-bad">{pwState.message}</p> : null}
        </div>
        <Dialog
          open={rebuildOpen}
          onOpenChange={setRebuildOpen}
          trigger={
            <Button variant="ghost">
              <RefreshCw size={15} /> {count ? 'Rebuild demo team' : 'Create demo team'}
            </Button>
          }
          title={count ? 'Rebuild the demo team' : 'Create the demo team'}
          description="Removes every demo account and creates five fresh ones. Real accounts are not touched; the audit trail is kept."
        >
          <form action={rbAction} className="space-y-4">
            <ul className="rounded-xl bg-soft p-3.5 text-xs text-mute space-y-1">
              <li><code className="text-ink">category-manager@</code> builds and submits categories</li>
              <li><code className="text-ink">approver@</code> approves categories and escalated cases</li>
              <li><code className="text-ink">reviewer@</code> reviews vendors, brands and catalogs</li>
              <li><code className="text-ink">seller@</code> a reseller organisation</li>
              <li><code className="text-ink">oem-seller@</code> a brand-owning (OEM) organisation</li>
            </ul>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Password for all five" htmlFor="rb-pw" hint="At least 10 characters, a letter and a number.">
                <Input id="rb-pw" name="password" type="text" autoComplete="off" required minLength={10} />
              </Field>
              <Field label="Email domain" htmlFor="rb-domain">
                <Input id="rb-domain" name="emailDomain" defaultValue="example.com" />
              </Field>
            </div>
            {rbState.status === 'error' ? <div className="rounded-xl bg-bad/10 p-3 text-sm text-bad">{rbState.message}</div> : null}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" onClick={() => setRebuildOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={rbPending}>
                <RefreshCw size={15} /> {count ? 'Rebuild' : 'Create'}
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </Card>
  );
}
