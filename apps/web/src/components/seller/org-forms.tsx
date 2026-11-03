'use client';

import { useState } from 'react';
import { Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Checkbox, Dialog, Field, Input, Select, Table, TBody, TD, TH, THead, TR } from '@orbita/ui';
import {
  addAddressAction,
  deleteDivisionAction,
  inviteMemberAction,
  removeAddressAction,
  removeMemberAction,
  saveDivisionAction,
  updateOrgAction,
} from '@/app/(app)/seller/actions';
import { useRunner } from '@/components/common/use-runner';

export function ProfileForm({ orgId, initial, editable }: { orgId: string; initial: { tradeName: string; contactName: string; contactPhone: string; website: string }; editable: boolean }) {
  const [f, setF] = useState({ ...initial, contactPhone: initial.contactPhone.replace(/^\+91/, '') });
  const { pending, run } = useRunner();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Trade name" htmlFor="pf-trade"><Input id="pf-trade" value={f.tradeName} onChange={set('tradeName')} disabled={!editable} /></Field>
      <Field label="Website" htmlFor="pf-web"><Input id="pf-web" value={f.website} onChange={set('website')} placeholder="https://" disabled={!editable} /></Field>
      <Field label="Contact person" htmlFor="pf-contact"><Input id="pf-contact" value={f.contactName} onChange={set('contactName')} disabled={!editable} /></Field>
      <Field label="Contact mobile" htmlFor="pf-phone"><Input id="pf-phone" value={f.contactPhone} onChange={set('contactPhone')} disabled={!editable} /></Field>
      {editable ? (
        <div className="sm:col-span-2 flex justify-end">
          <Button loading={pending} onClick={() => run(() => updateOrgAction(orgId, f))}>Save profile</Button>
        </div>
      ) : null}
    </div>
  );
}

export function AddAddressButton({ orgId, states }: { orgId: string; states: { code: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: 'manufacturing', label: '', line1: '', line2: '', city: '', stateCode: states[0]?.code ?? '', pincode: '' });
  const { pending, run } = useRunner();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Add address</Button>
      {open ? (
        <Dialog
          open
          onOpenChange={setOpen}
          title="Add an address"
          description="Manufacturing addresses are approved through the vendor assessment."
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => run(() => addAddressAction(orgId, f as never), () => setOpen(false))}>Add</Button></>}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" htmlFor="ad-kind">
              <Select id="ad-kind" value={f.kind} onChange={set('kind')}>
                <option value="manufacturing">Manufacturing</option>
                <option value="warehouse">Warehouse</option>
              </Select>
            </Field>
            <Field label="Label" htmlFor="ad-label"><Input id="ad-label" value={f.label} onChange={set('label')} placeholder="Plant 1" /></Field>
            <Field label="Address" htmlFor="ad-line1" className="sm:col-span-2"><Input id="ad-line1" value={f.line1} onChange={set('line1')} /></Field>
            <Input aria-label="Address line 2" className="sm:col-span-2" value={f.line2} onChange={set('line2')} placeholder="Area, landmark (optional)" />
            <Field label="City" htmlFor="ad-city"><Input id="ad-city" value={f.city} onChange={set('city')} /></Field>
            <Field label="PIN code" htmlFor="ad-pin"><Input id="ad-pin" inputMode="numeric" maxLength={6} value={f.pincode} onChange={set('pincode')} /></Field>
            <Field label="State" htmlFor="ad-state" className="sm:col-span-2">
              <Select id="ad-state" value={f.stateCode} onChange={set('stateCode')}>
                {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </Select>
            </Field>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

export function RemoveAddressButton({ orgId, id }: { orgId: string; id: string }) {
  const { pending, run } = useRunner();
  return (
    <Button variant="ghost" size="icon" aria-label="Remove address" loading={pending} onClick={() => run(() => removeAddressAction(orgId, id))}>
      <Trash2 size={15} />
    </Button>
  );
}

interface Member { id: string; name: string; email: string; status: string; role: string; divisionIds: string[] }
interface Division { id: string; name: string; categoryNodeIds: string[]; memberCount: number }

export function UsersPanel({ orgId, me, members, divisions, categories, canManage }: { orgId: string; me: string; members: Member[]; divisions: Division[]; categories: { id: string; path: string }[]; canManage: boolean }) {
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<Division | 'new' | null>(null);
  const { pending, run } = useRunner();
  const people = [...new Map(members.map((m) => [m.id, m])).values()];
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader title="Users" description="Seller admins manage the organisation and users; seller staff prepare brand requests and certificates." actions={canManage ? <Button size="sm" onClick={() => setInviting(true)}><UserPlus size={14} /> Add user</Button> : null} />
        <Table>
          <THead><TH>Name</TH><TH>Role</TH><TH className="hidden md:table-cell">Divisions</TH><TH className="w-12"><span className="sr-only">Actions</span></TH></THead>
          <TBody>
            {members.map((m) => (
              <TR key={`${m.id}-${m.role}`}>
                <TD><div className="font-medium">{m.name || m.email}</div><div className="text-xs text-mute">{m.email}{m.status === 'invited' ? ' · invite sent' : ''}</div></TD>
                <TD><Badge tone={m.role === 'seller_admin' ? 'accent' : 'neutral'}>{m.role === 'seller_admin' ? 'Seller admin' : m.role === 'seller_staff' ? 'Seller staff' : 'Brand owner'}</Badge></TD>
                <TD className="hidden md:table-cell text-sm text-mute">{m.divisionIds.map((d) => divisions.find((x) => x.id === d)?.name).filter(Boolean).join(', ') || '—'}</TD>
                <TD>{canManage && m.id !== me && m.role !== 'brand_owner' ? <Button variant="ghost" size="icon" aria-label={`Remove ${m.name}`} loading={pending} onClick={() => run(() => removeMemberAction(orgId, m.id))}><Trash2 size={15} /></Button> : null}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Divisions" description="Teams that list only in some categories (used for catalogs in R5)." actions={canManage ? <Button variant="secondary" size="sm" onClick={() => setEditing('new')}><Plus size={14} /> New division</Button> : null} />
        {divisions.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {divisions.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                <Users size={16} className="text-mute" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-mute truncate">{d.memberCount} member{d.memberCount === 1 ? '' : 's'} · {d.categoryNodeIds.length ? d.categoryNodeIds.map((c) => categories.find((x) => x.id === c)?.path.split(' › ').at(-1)).join(', ') : 'all categories'}</div>
                </div>
                {canManage ? <Button variant="ghost" size="sm" onClick={() => setEditing(d)}>Edit</Button> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t border-line px-5 py-4 text-sm text-mute">No divisions. Everyone lists in every category your organisation may sell.</p>
        )}
      </Card>
      {inviting ? <InviteDialog orgId={orgId} divisions={divisions} onClose={() => setInviting(false)} /> : null}
      {editing ? <DivisionDialog orgId={orgId} division={editing === 'new' ? null : editing} people={people} categories={categories} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function InviteDialog({ orgId, divisions, onClose }: { orgId: string; divisions: Division[]; onClose: () => void }) {
  const [f, setF] = useState({ email: '', fullName: '', role: 'seller_staff' as 'seller_staff' | 'seller_admin', divisionIds: [] as string[] });
  const [link, setLink] = useState<string | null>(null);
  const { pending, run } = useRunner();
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a user"
      description="They get an email to set their password."
      footer={link ? <Button onClick={onClose}>Done</Button> : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={pending} onClick={() => run(() => inviteMemberAction(orgId, f), (s) => { const l = (s.data as { link?: string } | undefined)?.link; if (l) setLink(l); else onClose(); })}>Add user</Button></>}
    >
      {link ? (
        <p className="text-sm break-all">Share this invite link: <a className="text-accent" href={link}>{link}</a></p>
      ) : (
        <div className="space-y-3">
          <Field label="Name" htmlFor="iv-name"><Input id="iv-name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
          <Field label="Email" htmlFor="iv-email"><Input id="iv-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Role" htmlFor="iv-role">
            <Select id="iv-role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as never })}>
              <option value="seller_staff">Seller staff</option>
              <option value="seller_admin">Seller admin</option>
            </Select>
          </Field>
          {divisions.length ? (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium mb-1">Divisions</legend>
              {divisions.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={f.divisionIds.includes(d.id)} onChange={(e) => setF({ ...f, divisionIds: e.target.checked ? [...f.divisionIds, d.id] : f.divisionIds.filter((x) => x !== d.id) })} /> {d.name}
                </label>
              ))}
            </fieldset>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

function DivisionDialog({ orgId, division, people, categories, onClose }: { orgId: string; division: Division | null; people: Member[]; categories: { id: string; path: string }[]; onClose: () => void }) {
  const [name, setName] = useState(division?.name ?? '');
  const [cats, setCats] = useState<string[]>(division?.categoryNodeIds ?? []);
  const [memberIds, setMemberIds] = useState<string[]>(division ? people.filter((p) => p.divisionIds.includes(division.id)).map((p) => p.id) : []);
  const { pending, run } = useRunner();
  const toggle = (list: string[], set: (v: string[]) => void, id: string, on: boolean) => set(on ? [...list, id] : list.filter((x) => x !== id));
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={division ? `Edit ${division.name}` : 'New division'}
      footer={
        <>
          {division ? <Button variant="danger" className="mr-auto" loading={pending} onClick={() => run(() => deleteDivisionAction(orgId, division.id), onClose)}>Delete</Button> : null}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={pending} onClick={() => run(() => saveDivisionAction(orgId, division?.id ?? null, { name, categoryNodeIds: cats, memberIds }), onClose)}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="dv-name"><Input id="dv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Laptops team" /></Field>
        <fieldset>
          <legend className="text-sm font-medium mb-1">Categories <span className="text-mute font-normal">(none = all)</span></legend>
          <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-line p-2">
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm"><Checkbox checked={cats.includes(c.id)} onChange={(e) => toggle(cats, setCats, c.id, e.target.checked)} /> {c.path}</label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-medium mb-1">Members</legend>
          <div className="space-y-1">
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm"><Checkbox checked={memberIds.includes(p.id)} onChange={(e) => toggle(memberIds, setMemberIds, p.id, e.target.checked)} /> {p.name || p.email}</label>
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}
