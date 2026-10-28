'use client';

import { useEffect, useState } from 'react';
import { ListOrdered, Plus, Ruler, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
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
  Textarea,
} from '@orbita/ui';
import {
  getValueListAction,
  saveBooleanPairAction,
  saveCertificateTypeAction,
  saveDimensionAction,
  saveUnitAction,
  saveValueListAction,
  updateSettingAction,
} from '@/app/(app)/admin/library/actions';
import { splitList, useRunner } from '@/components/common/use-runner';

const statusBadge = (s: string) => <Badge tone={s === 'active' ? 'ok' : 'neutral'}>{s === 'active' ? 'Active' : 'Deprecated'}</Badge>;

/* ================================================================ Value lists */

type Kind = 'plain' | 'ordinal' | 'group_ordinal';
const KIND_LABEL: Record<Kind, string> = { plain: 'Plain list', ordinal: 'Ranked', group_ordinal: 'Ranked within groups' };

export interface ListRow {
  id: string;
  code: string;
  name: string;
  description: string;
  kind: Kind;
  status: string;
  itemCount: number;
}

interface Item {
  key: string;
  id?: string;
  value: string;
  weight: string;
  groupName: string;
  status: 'active' | 'deprecated';
}

export function ValueListsTab({ rows, canEdit }: { rows: ListRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<ListRow | 'new' | null>(null);
  return (
    <Card>
      <CardHeader
        title="Value lists"
        description="Reusable lists of allowed values, like processor families. Ranked lists let buyers compare (higher is better)."
        actions={canEdit ? <Button onClick={() => setEditing('new')}><Plus size={16} /> New list</Button> : null}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<ListOrdered size={22} />} title="No value lists yet" description="Create a list, then use it in pick-from-list attributes." />
      ) : (
        <Table>
          <THead>
            <TH>List</TH>
            <TH>Kind</TH>
            <TH>Values</TH>
            <TH>Status</TH>
          </THead>
          <TBody>
            {rows.map((l) => (
              <TR key={l.id}>
                <TD>
                  <button type="button" className="text-left" onClick={() => setEditing(l)}>
                    <span className="block font-medium">{l.name}</span>
                    <code className="text-[11px] text-mute">{l.code}</code>
                  </button>
                </TD>
                <TD className="text-mute">{KIND_LABEL[l.kind]}</TD>
                <TD className="text-mute">{l.itemCount}</TD>
                <TD>{statusBadge(l.status)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {editing ? (
        <ValueListDrawer key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} canEdit={canEdit} onClose={() => setEditing(null)} />
      ) : null}
    </Card>
  );
}

let seq = 0;
const newItem = (value = ''): Item => ({ key: `n${++seq}`, value, weight: '', groupName: '', status: 'active' });

function ValueListDrawer({ initial, canEdit, onClose }: { initial: ListRow | null; canEdit: boolean; onClose: () => void }) {
  const [meta, setMeta] = useState({
    name: initial?.name ?? '',
    code: initial?.code ?? '',
    description: initial?.description ?? '',
    kind: (initial?.kind ?? 'plain') as Kind,
    status: initial?.status ?? 'active',
  });
  const [items, setItems] = useState<Item[] | null>(initial ? null : [newItem()]);
  const [bulk, setBulk] = useState('');
  const { pending, run } = useRunner();

  useEffect(() => {
    if (!initial) return;
    let live = true;
    getValueListAction(initial.id).then(
      (l: { items: { id: string; value: string; weight: number | null; groupName: string | null; status: 'active' | 'deprecated' }[] }) => {
        if (!live) return;
        setItems(
          l.items.map((i) => ({
            key: i.id,
            id: i.id,
            value: i.value,
            weight: i.weight === null ? '' : String(i.weight),
            groupName: i.groupName ?? '',
            status: i.status,
          })),
        );
      },
    );
    return () => {
      live = false;
    };
  }, [initial]);

  const update = (key: string, patch: Partial<Item>) => setItems((xs) => xs!.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const ranked = meta.kind !== 'plain';

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? initial.name : 'New value list'}
      width={620}
      footer={
        canEdit ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              loading={pending}
              disabled={!meta.name.trim() || !items}
              onClick={() =>
                run(
                  () =>
                    saveValueListAction({
                      id: initial?.id,
                      ...meta,
                      code: meta.code || undefined,
                      status: meta.status as 'active' | 'deprecated',
                      items: items!
                        .filter((i) => i.value.trim())
                        .map((i) => ({
                          id: i.id,
                          value: i.value,
                          weight: i.weight === '' ? null : Number(i.weight),
                          groupName: i.groupName || null,
                          status: i.status,
                        })),
                    }),
                  onClose,
                )
              }
            >
              Save list
            </Button>
          </>
        ) : null
      }
    >
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name" htmlFor="vl-name" required>
            <Input id="vl-name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="Processor families" />
          </Field>
          <Field label="Code" htmlFor="vl-code" hint="Optional; derived from the name.">
            <Input id="vl-code" value={meta.code} onChange={(e) => setMeta({ ...meta, code: e.target.value })} />
          </Field>
        </div>
        <Field label="Kind" htmlFor="vl-kind" hint="Ranked: each value has a weight, higher is better. Ranked within groups: weights compare only inside a group.">
          <Select id="vl-kind" value={meta.kind} onChange={(e) => setMeta({ ...meta, kind: e.target.value as Kind })}>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Description" htmlFor="vl-desc">
          <Textarea id="vl-desc" value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} className="min-h-16" />
        </Field>

        <div>
          <div className="text-sm font-medium mb-1.5">Values</div>
          {items === null ? (
            <p className="text-sm text-mute">Loading…</p>
          ) : (
            <div className="space-y-2">
              {items.map((i) => (
                <div key={i.key} className={`flex gap-2 ${i.status === 'deprecated' ? 'opacity-50' : ''}`}>
                  <Input value={i.value} onChange={(e) => update(i.key, { value: e.target.value })} placeholder="Value" className="h-10" aria-label="Value" />
                  {meta.kind === 'group_ordinal' ? (
                    <Input value={i.groupName} onChange={(e) => update(i.key, { groupName: e.target.value })} placeholder="Group" className="h-10 w-36" aria-label="Group" />
                  ) : null}
                  {ranked ? (
                    <Input value={i.weight} onChange={(e) => update(i.key, { weight: e.target.value })} placeholder="Weight" inputMode="numeric" className="h-10 w-24" aria-label="Weight" />
                  ) : null}
                  {i.id ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={i.status === 'active' ? 'Deprecate value' : 'Restore value'}
                      title={i.status === 'active' ? 'Deprecate (kept for existing products)' : 'Restore'}
                      onClick={() => update(i.key, { status: i.status === 'active' ? 'deprecated' : 'active' })}
                    >
                      {i.status === 'active' ? <Trash2 size={15} /> : <Plus size={15} />}
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" aria-label="Remove value" onClick={() => setItems(items.filter((x) => x.key !== i.key))}>
                      <X size={15} />
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setItems([...items, newItem()])}>
                  <Plus size={14} /> Add value
                </Button>
              </div>
              <Field label="Add many" htmlFor="vl-bulk" hint="Paste one value per line, then press Add.">
                <div className="flex gap-2">
                  <Textarea id="vl-bulk" value={bulk} onChange={(e) => setBulk(e.target.value)} className="min-h-16" />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const vals = bulk.split('\n').map((x) => x.trim()).filter(Boolean);
                      setItems([...items.filter((x) => x.value.trim()), ...vals.map((v) => newItem(v))]);
                      setBulk('');
                    }}
                  >
                    Add
                  </Button>
                </div>
              </Field>
            </div>
          )}
        </div>
        {initial ? (
          <Field label="Status" htmlFor="vl-status">
            <Select id="vl-status" value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="deprecated">Deprecated</option>
            </Select>
          </Field>
        ) : null}
      </fieldset>
    </Drawer>
  );
}

/* ================================================================ Units */

export interface DimensionRow {
  id: string;
  code: string;
  name: string;
  status: string;
  units: { id: string; code: string; name: string; symbol: string; factorToBase: string; isBase: boolean; status: string }[];
}

export function UnitsTab({ dimensions, canEdit }: { dimensions: DimensionRow[]; canEdit: boolean }) {
  const [unitFor, setUnitFor] = useState<{ dim: DimensionRow; unit?: DimensionRow['units'][number] } | null>(null);
  const [dimEdit, setDimEdit] = useState<DimensionRow | 'new' | null>(null);
  return (
    <>
      {canEdit ? (
        <div className="mb-3 flex justify-end">
          <Button onClick={() => setDimEdit('new')}><Plus size={16} /> New dimension</Button>
        </div>
      ) : null}
      <div className="grid md:grid-cols-2 gap-3">
        {dimensions.map((d) => {
          const base = d.units.find((u) => u.isBase);
          return (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="text-left" onClick={() => setDimEdit(d)}>
                  <div className="flex items-center gap-2 font-semibold"><Ruler size={16} className="text-accent" /> {d.name}</div>
                  <div className="text-xs text-mute mt-0.5">Base unit: {base ? `${base.name} (${base.symbol})` : 'none'}</div>
                </button>
                {canEdit ? (
                  <Button size="sm" variant="ghost" onClick={() => setUnitFor({ dim: d })}><Plus size={14} /> Unit</Button>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.units.map((u) => (
                  <button key={u.id} type="button" onClick={() => setUnitFor({ dim: d, unit: u })} title={`1 ${u.symbol} = ${Number(u.factorToBase)} ${base?.symbol ?? ''}`}>
                    <Badge tone={u.isBase ? 'accent' : u.status === 'active' ? 'neutral' : 'neutral'} className={u.status !== 'active' ? 'line-through' : ''}>
                      {u.symbol}
                    </Badge>
                  </button>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
      {unitFor ? <UnitDrawer key={unitFor.unit?.id ?? `new-${unitFor.dim.id}`} dim={unitFor.dim} unit={unitFor.unit} canEdit={canEdit} onClose={() => setUnitFor(null)} /> : null}
      {dimEdit ? <DimensionDrawer key={dimEdit === 'new' ? 'new' : dimEdit.id} initial={dimEdit === 'new' ? null : dimEdit} canEdit={canEdit} onClose={() => setDimEdit(null)} /> : null}
    </>
  );
}

function DimensionDrawer({ initial, canEdit, onClose }: { initial: DimensionRow | null; canEdit: boolean; onClose: () => void }) {
  const [f, setF] = useState({ name: initial?.name ?? '', code: initial?.code ?? '', status: initial?.status ?? 'active' });
  const { pending, run } = useRunner();
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? initial.name : 'New dimension'}
      description="A kind of measurement whose units convert into each other, like length or data storage."
      footer={canEdit ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={pending} disabled={!f.name.trim()} onClick={() => run(() => saveDimensionAction({ id: initial?.id, name: f.name, code: f.code || undefined, status: f.status as 'active' }), onClose)}>Save</Button></> : null}
    >
      <fieldset disabled={!canEdit} className="space-y-4">
        <Field label="Name" htmlFor="d-name" required><Input id="d-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Code" htmlFor="d-code" hint="Optional; derived from the name."><Input id="d-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        {initial ? (
          <Field label="Status" htmlFor="d-status"><Select id="d-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">Active</option><option value="deprecated">Deprecated</option></Select></Field>
        ) : null}
      </fieldset>
    </Drawer>
  );
}

function UnitDrawer({ dim, unit, canEdit, onClose }: { dim: DimensionRow; unit?: DimensionRow['units'][number]; canEdit: boolean; onClose: () => void }) {
  const base = dim.units.find((u) => u.isBase);
  const [f, setF] = useState({
    name: unit?.name ?? '',
    code: unit?.code ?? '',
    symbol: unit?.symbol ?? '',
    factor: unit ? String(Number(unit.factorToBase)) : '',
    isBase: unit?.isBase ?? !base,
    status: unit?.status ?? 'active',
  });
  const { pending, run } = useRunner();
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={unit ? `${unit.name} (${unit.symbol})` : `New unit of ${dim.name.toLowerCase()}`}
      footer={
        canEdit ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              loading={pending}
              disabled={!f.name.trim() || !f.symbol.trim()}
              onClick={() =>
                run(
                  () =>
                    saveUnitAction({
                      id: unit?.id,
                      dimensionId: dim.id,
                      name: f.name,
                      code: f.code || undefined,
                      symbol: f.symbol,
                      factorToBase: f.isBase ? 1 : Number(f.factor),
                      isBase: f.isBase,
                      status: f.status as 'active',
                    }),
                  onClose,
                )
              }
            >
              Save
            </Button>
          </>
        ) : null
      }
    >
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" htmlFor="u-name" required><Input id="u-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Gigabyte" /></Field>
          <Field label="Symbol" htmlFor="u-sym" required><Input id="u-sym" value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} placeholder="GB" /></Field>
        </div>
        <Field label="Code" htmlFor="u-code" hint="Optional; derived from the name."><Input id="u-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <label className="flex items-center gap-2.5 text-sm">
          <Checkbox checked={f.isBase} onChange={(e) => setF({ ...f, isBase: e.target.checked })} /> Base unit of {dim.name.toLowerCase()}
        </label>
        {!f.isBase ? (
          <Field label={`1 ${f.symbol || 'unit'} equals how many ${base?.symbol ?? 'base units'}?`} htmlFor="u-factor" hint="Used to convert values between units.">
            <Input id="u-factor" inputMode="decimal" value={f.factor} onChange={(e) => setF({ ...f, factor: e.target.value })} />
          </Field>
        ) : null}
        {unit ? (
          <Field label="Status" htmlFor="u-status"><Select id="u-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">Active</option><option value="deprecated">Deprecated</option></Select></Field>
        ) : null}
      </fieldset>
    </Drawer>
  );
}

/* ================================================================ Boolean pairs */

export function PairsTab({ rows, canEdit }: { rows: { id: string; code: string; trueLabel: string; falseLabel: string; status: string }[]; canEdit: boolean }) {
  const [f, setF] = useState({ trueLabel: '', falseLabel: '' });
  const { pending, run } = useRunner();
  return (
    <Card>
      <CardHeader title="Yes / no labels" description="The two words a yes/no attribute shows to sellers and buyers." />
      <Table>
        <THead><TH>Labels</TH><TH>Code</TH><TH>Status</TH></THead>
        <TBody>
          {rows.map((p) => (
            <TR key={p.id}>
              <TD className="font-medium">{p.trueLabel} / {p.falseLabel}</TD>
              <TD><code className="text-[11px] text-mute">{p.code}</code></TD>
              <TD>{statusBadge(p.status)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {canEdit ? (
        <form
          className="flex flex-wrap gap-2 border-t border-line px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveBooleanPairAction(f), () => setF({ trueLabel: '', falseLabel: '' }));
          }}
        >
          <Input value={f.trueLabel} onChange={(e) => setF({ ...f, trueLabel: e.target.value })} placeholder="Yes label, e.g. Compliant" className="h-10 max-w-60" aria-label="Yes label" />
          <Input value={f.falseLabel} onChange={(e) => setF({ ...f, falseLabel: e.target.value })} placeholder="No label, e.g. Not compliant" className="h-10 max-w-60" aria-label="No label" />
          <Button type="submit" variant="secondary" loading={pending} disabled={!f.trueLabel.trim() || !f.falseLabel.trim()}>
            <Plus size={15} /> Add pair
          </Button>
        </form>
      ) : null}
    </Card>
  );
}

/* ================================================================ Certificate types */

export interface CertRow {
  id: string;
  code: string;
  name: string;
  issuer: string;
  level: 'product' | 'seller' | 'both';
  fields: string[];
  verification: string;
  hasExpiry: boolean;
  reminderDays: number[];
  status: string;
}
const LEVEL: Record<CertRow['level'], string> = { product: 'Product', seller: 'Seller', both: 'Product and seller' };

export function CertificatesTab({ rows, canEdit }: { rows: CertRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<CertRow | 'new' | null>(null);
  return (
    <Card>
      <CardHeader
        title="Certificate types"
        description="Certificates categories can require (safety, licences, quality). Sellers upload them in R4 and R5."
        actions={canEdit ? <Button onClick={() => setEditing('new')}><Plus size={16} /> New type</Button> : null}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={22} />} title="No certificate types" />
      ) : (
        <Table>
          <THead><TH>Certificate</TH><TH>Applies to</TH><TH className="hidden md:table-cell">Expiry</TH><TH>Status</TH></THead>
          <TBody>
            {rows.map((c) => (
              <TR key={c.id}>
                <TD>
                  <button type="button" className="text-left" onClick={() => setEditing(c)}>
                    <span className="block font-medium">{c.name}</span>
                    <span className="block text-xs text-mute">{c.issuer}</span>
                  </button>
                </TD>
                <TD className="text-mute">{LEVEL[c.level]}</TD>
                <TD className="hidden md:table-cell text-mute">{c.hasExpiry ? `Reminders ${c.reminderDays.join(', ')} days before` : 'Does not expire'}</TD>
                <TD>{statusBadge(c.status)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {editing ? <CertDrawer key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} canEdit={canEdit} onClose={() => setEditing(null)} /> : null}
    </Card>
  );
}

function CertDrawer({ initial, canEdit, onClose }: { initial: CertRow | null; canEdit: boolean; onClose: () => void }) {
  const [f, setF] = useState({
    name: initial?.name ?? '',
    code: initial?.code ?? '',
    issuer: initial?.issuer ?? '',
    level: initial?.level ?? 'product',
    fields: (initial?.fields ?? ['number', 'valid_until']).join(', '),
    hasExpiry: initial?.hasExpiry ?? true,
    reminderDays: (initial?.reminderDays ?? [30, 7]).join(', '),
    status: initial?.status ?? 'active',
  });
  const { pending, run } = useRunner();
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? initial.name : 'New certificate type'}
      footer={
        canEdit ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              loading={pending}
              disabled={!f.name.trim()}
              onClick={() =>
                run(
                  () =>
                    saveCertificateTypeAction({
                      id: initial?.id,
                      name: f.name,
                      code: f.code || undefined,
                      issuer: f.issuer,
                      level: f.level,
                      fields: splitList(f.fields),
                      hasExpiry: f.hasExpiry,
                      reminderDays: splitList(f.reminderDays).map(Number),
                      status: f.status as 'active',
                    }),
                  onClose,
                )
              }
            >
              Save
            </Button>
          </>
        ) : null
      }
    >
      <fieldset disabled={!canEdit} className="space-y-4">
        <Field label="Name" htmlFor="c-name" required><Input id="c-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Code" htmlFor="c-code" hint="Optional."><Input id="c-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
          <Field label="Applies to" htmlFor="c-level">
            <Select id="c-level" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value as CertRow['level'] })}>
              {(Object.keys(LEVEL) as CertRow['level'][]).map((k) => <option key={k} value={k}>{LEVEL[k]}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Issued by" htmlFor="c-issuer"><Input id="c-issuer" value={f.issuer} onChange={(e) => setF({ ...f, issuer: e.target.value })} /></Field>
        <Field label="Fields captured" htmlFor="c-fields" hint="Comma separated, e.g. number, issued_on, valid_until.">
          <Input id="c-fields" value={f.fields} onChange={(e) => setF({ ...f, fields: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2.5 text-sm"><Checkbox checked={f.hasExpiry} onChange={(e) => setF({ ...f, hasExpiry: e.target.checked })} /> Expires</label>
        {f.hasExpiry ? (
          <Field label="Remind sellers (days before expiry)" htmlFor="c-rem" hint="Comma separated, e.g. 30, 7.">
            <Input id="c-rem" value={f.reminderDays} onChange={(e) => setF({ ...f, reminderDays: e.target.value })} />
          </Field>
        ) : null}
        {initial ? (
          <Field label="Status" htmlFor="c-status"><Select id="c-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">Active</option><option value="deprecated">Deprecated</option></Select></Field>
        ) : null}
      </fieldset>
    </Drawer>
  );
}

/* ================================================================ Platform limits */

export function LimitsTab({ rows, canEdit }: { rows: { key: string; label: string; value: unknown; unit: string; description: string }[]; canEdit: boolean }) {
  return (
    <Card>
      <CardHeader title="Platform limits" description="Caps that apply everywhere. Categories can be stricter, never looser." />
      <Table>
        <THead><TH>Limit</TH><TH>Value</TH></THead>
        <TBody>
          {rows.map((s) => <LimitRow key={s.key} row={s} canEdit={canEdit} />)}
        </TBody>
      </Table>
    </Card>
  );
}

function LimitRow({ row, canEdit }: { row: { key: string; label: string; value: unknown; unit: string; description: string }; canEdit: boolean }) {
  const [v, setV] = useState(String(row.value));
  const { pending, run } = useRunner();
  const dirty = v !== String(row.value);
  return (
    <TR>
      <TD>
        <div className="font-medium">{row.label}</div>
        <div className="text-xs text-mute">{row.description}</div>
      </TD>
      <TD>
        <div className="flex items-center gap-2">
          <Input value={v} onChange={(e) => setV(e.target.value)} disabled={!canEdit} inputMode="numeric" className="h-9 w-24" aria-label={row.label} />
          <span className="text-xs text-mute whitespace-nowrap">{row.unit}</span>
          {canEdit && dirty ? (
            <Button size="sm" loading={pending} onClick={() => run(() => updateSettingAction(row.key, v))}>Save</Button>
          ) : null}
        </div>
      </TD>
    </TR>
  );
}
