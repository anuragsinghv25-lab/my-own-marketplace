'use client';

import { useEffect, useState } from 'react';
import { FolderTree, Network, Plus, Search, UserPlus, X } from 'lucide-react';
import { Avatar, Badge, Button, Card, Dialog, Drawer, EmptyState, Field, Input, Select, Textarea } from '@orbita/ui';
import {
  addMemberAction,
  assignWorkgroupAction,
  removeMemberAction,
  saveWorkgroupAction,
  searchCategoriesAction,
} from '@/app/(app)/admin/workgroups/actions';
import { useRunner } from '@/components/common/use-runner';

export interface WorkgroupRow {
  id: string;
  code: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  covers: { id: string; name: string; code: string; level: number }[];
  members: { grantId: string; role: string; roleLabel: string; userId: string; fullName: string; email: string }[];
}

export interface StaffUser {
  id: string;
  fullName: string;
  email: string;
}

export function WorkgroupsView({ rows, staff, canEdit }: { rows: WorkgroupRow[]; staff: StaffUser[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<WorkgroupRow | 'new' | null>(null);
  return (
    <>
      {canEdit ? (
        <div className="mb-3 flex justify-end">
          <Button onClick={() => setEditing('new')}><Plus size={16} /> New workgroup</Button>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Network size={22} />}
            title="No workgroups yet"
            description="A workgroup is a team (category managers and approvers) responsible for part of the category tree."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((w) => <WorkgroupCard key={w.id} w={w} staff={staff} canEdit={canEdit} onEdit={() => setEditing(w)} />)}
        </div>
      )}
      {editing ? <WorkgroupDrawer key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function WorkgroupCard({ w, staff, canEdit, onEdit }: { w: WorkgroupRow; staff: StaffUser[]; canEdit: boolean; onEdit: () => void }) {
  const { pending, run } = useRunner();
  return (
    <Card className={w.status === 'inactive' ? 'opacity-60' : ''}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-lg tracking-tight">{w.name}</h2>
            {w.status === 'inactive' ? <Badge>Inactive</Badge> : null}
          </div>
          {w.description ? <p className="text-sm text-mute mt-0.5">{w.description}</p> : null}
        </div>
        {canEdit ? <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button> : null}
      </div>
      <div className="grid md:grid-cols-2 border-t border-line">
        <section className="p-5 md:border-r border-line">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><FolderTree size={15} className="text-mute" /> Responsible for</h3>
            {canEdit && w.status === 'active' ? <AddCoverage workgroupId={w.id} /> : null}
          </div>
          <p className="text-xs text-mute mt-0.5 mb-2.5">Everything under these categories belongs to this workgroup.</p>
          <div className="flex flex-wrap gap-1.5">
            {w.covers.length === 0 ? <span className="text-sm text-mute">No categories yet</span> : null}
            {w.covers.map((c) => (
              <Badge key={c.id} tone="accent" className="gap-1.5">
                {c.name} <code className="text-[10px] opacity-70">{c.code}</code>
                {canEdit ? (
                  <button type="button" aria-label={`Remove ${c.name}`} disabled={pending} onClick={() => run(() => assignWorkgroupAction(c.id, null))}>
                    <X size={12} />
                  </button>
                ) : null}
              </Badge>
            ))}
          </div>
        </section>
        <section className="p-5 border-t md:border-t-0 border-line">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Members</h3>
            {canEdit && w.status === 'active' ? <AddMember workgroupId={w.id} staff={staff} existing={w.members} /> : null}
          </div>
          <p className="text-xs text-mute mt-0.5 mb-2.5">Category managers build categories here; approvers approve them (R3).</p>
          <ul className="space-y-2">
            {w.members.length === 0 ? <li className="text-sm text-mute">No members yet</li> : null}
            {w.members.map((m) => (
              <li key={m.grantId} className="flex items-center gap-2.5">
                <Avatar name={m.fullName || m.email} className="h-7 w-7 text-[11px]" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{m.fullName || m.email}</div>
                  <div className="text-xs text-mute truncate">{m.email}</div>
                </div>
                <Badge tone={m.role === 'approver' ? 'ai' : 'neutral'}>{m.roleLabel}</Badge>
                {canEdit ? (
                  <Button size="icon" variant="ghost" aria-label={`Remove ${m.fullName || m.email}`} loading={pending} onClick={() => run(() => removeMemberAction(m.userId, m.grantId))}>
                    <X size={14} />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Card>
  );
}

function AddCoverage({ workgroupId }: { workgroupId: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; level: number; path: string }[]>([]);
  const { pending, run } = useRunner();
  useEffect(() => {
    if (q.trim().length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchCategoriesAction(q);
      if (live) setResults(r.filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus size={14} /> Add</Button>
      {open ? (
        <Dialog open onOpenChange={setOpen} title="Add a category to this workgroup" description="Usually a segment (L1) or family (L2); everything under it comes along.">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the tree" className="pl-9" autoFocus aria-label="Search categories" />
          </div>
          <ul className="mt-3 divide-y divide-line">
            {(q.trim().length >= 2 ? results : []).map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{r.name} <span className="text-xs text-mute">L{r.level}</span></div>
                  <div className="text-xs text-mute truncate">{r.path}</div>
                </div>
                <Button size="sm" loading={pending} onClick={() => run(() => assignWorkgroupAction(r.id, workgroupId), () => setOpen(false))}>Add</Button>
              </li>
            ))}
          </ul>
        </Dialog>
      ) : null}
    </>
  );
}

function AddMember({ workgroupId, staff, existing }: { workgroupId: string; staff: StaffUser[]; existing: WorkgroupRow['members'] }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('category_manager');
  const { pending, run } = useRunner();
  const taken = new Set(existing.filter((m) => m.role === role).map((m) => m.userId));
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><UserPlus size={14} /> Add</Button>
      {open ? (
        <Dialog
          open
          onOpenChange={setOpen}
          title="Add a member"
          description="This grants the role limited to this workgroup. Separation-of-duties rules still apply."
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} disabled={!userId} onClick={() => run(() => addMemberAction(workgroupId, userId, role), () => setOpen(false))}>Add member</Button></>}
        >
          <div className="space-y-4">
            <Field label="Role" htmlFor="wm-role">
              <Select id="wm-role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="category_manager">Category manager</option>
                <option value="approver">Approver</option>
              </Select>
            </Field>
            <Field label="Person" htmlFor="wm-user" hint="Staff users who are active. Invite new people from Users.">
              <Select id="wm-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Choose…</option>
                {staff.filter((u) => !taken.has(u.id)).map((u) => <option key={u.id} value={u.id}>{u.fullName || u.email} · {u.email}</option>)}
              </Select>
            </Field>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

function WorkgroupDrawer({ initial, onClose }: { initial: WorkgroupRow | null; onClose: () => void }) {
  const [f, setF] = useState({ name: initial?.name ?? '', description: initial?.description ?? '', status: initial?.status ?? 'active' });
  const { pending, run } = useRunner();
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? initial.name : 'New workgroup'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={pending} disabled={!f.name.trim()} onClick={() => run(() => saveWorkgroupAction({ id: initial?.id, ...f }), onClose)}>Save</Button></>}
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="wg-name" required><Input id="wg-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="IT Hardware" /></Field>
        <Field label="Description" htmlFor="wg-desc"><Textarea id="wg-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {initial ? (
          <Field label="Status" htmlFor="wg-status">
            <Select id="wg-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as 'active' | 'inactive' })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        ) : null}
      </div>
    </Drawer>
  );
}
