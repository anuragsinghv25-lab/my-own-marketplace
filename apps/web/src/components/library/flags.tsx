'use client';

import { useEffect, useMemo, useState } from 'react';
import { Flag, Layers, Plus } from 'lucide-react';
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
  Switch,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
} from '@orbita/ui';
import { FLAG_GROUPS, FLAG_VALUE_TYPES, type FlagValueType } from '@orbita/library/schemas';
import { getFlagProfileAction, saveFlagDefinitionAction, saveFlagProfileAction } from '@/app/(app)/admin/flags/actions';
import { splitList, useRunner } from '@/components/common/use-runner';

export interface FlagDef {
  id: string;
  key: string;
  label: string;
  groupName: (typeof FLAG_GROUPS)[number];
  ownerModule: string;
  valueType: FlagValueType;
  schema: { options?: string[]; unit?: string; min?: number; max?: number };
  defaultValue: unknown;
  helpText: string;
  status: 'active' | 'deprecated';
}

const TYPE_LABEL: Record<FlagValueType, string> = {
  boolean: 'Yes / no',
  number: 'Number',
  text: 'Text',
  single_select: 'Pick one',
  multi_select: 'Pick several',
  range: 'Range',
};
const GROUP_LABEL: Record<FlagDef['groupName'], string> = {
  category: 'Category',
  seller: 'Seller',
  buyer: 'Buyer',
  marketplace: 'Marketplace',
  transactional: 'Transactional',
};

const pretty = (s: string) => s.replace(/_/g, ' ');

export function formatFlagValue(def: Pick<FlagDef, 'valueType' | 'schema'>, v: unknown): string {
  if (v === undefined || v === null) return '—';
  switch (def.valueType) {
    case 'boolean':
      return v ? 'Yes' : 'No';
    case 'multi_select':
      return Array.isArray(v) ? v.map((x) => pretty(String(x))).join(', ') : '—';
    case 'single_select':
      return pretty(String(v));
    case 'range': {
      const r = v as { min: number; max: number };
      return `${r.min}–${r.max}${def.schema.unit ? ` ${def.schema.unit}` : ''}`;
    }
    case 'number':
      return `${v}${def.schema.unit ? ` ${def.schema.unit}` : ''}`;
    default:
      return String(v);
  }
}

/** Edits one value of a flag, shaped by its type. */
export function FlagValueInput({
  def,
  value,
  onChange,
  id,
}: {
  def: Pick<FlagDef, 'valueType' | 'schema' | 'label'>;
  value: unknown;
  onChange: (v: unknown) => void;
  id: string;
}) {
  const opts = def.schema.options ?? [];
  switch (def.valueType) {
    case 'boolean':
      return <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} label={value ? 'Yes' : 'No'} />;
    case 'number':
      return (
        <div className="flex items-center gap-2">
          <Input id={id} inputMode="decimal" className="h-10 w-28" value={value === undefined || value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
          {def.schema.unit ? <span className="text-xs text-mute">{def.schema.unit}</span> : null}
        </div>
      );
    case 'text':
      return <Input id={id} className="h-10" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
    case 'single_select':
      return (
        <Select id={id} className="h-10" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {opts.map((o) => <option key={o} value={o}>{pretty(o)}</option>)}
        </Select>
      );
    case 'multi_select': {
      const cur = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-2" id={id}>
          {opts.map((o) => (
            <label key={o} className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={cur.includes(o)} onChange={(e) => onChange(e.target.checked ? [...cur, o] : cur.filter((x) => x !== o))} />
              {pretty(o)}
            </label>
          ))}
        </div>
      );
    }
    case 'range': {
      const r = (value as { min?: number; max?: number }) ?? {};
      const set = (k: 'min' | 'max', s: string) => onChange({ ...r, [k]: s === '' ? undefined : Number(s) });
      return (
        <div className="flex items-center gap-2" id={id}>
          <Input inputMode="decimal" className="h-10 w-20" value={r.min ?? ''} onChange={(e) => set('min', e.target.value)} aria-label={`${def.label} from`} />
          <span className="text-mute text-sm">to</span>
          <Input inputMode="decimal" className="h-10 w-20" value={r.max ?? ''} onChange={(e) => set('max', e.target.value)} aria-label={`${def.label} to`} />
          {def.schema.unit ? <span className="text-xs text-mute">{def.schema.unit}</span> : null}
        </div>
      );
    }
  }
}

/* ================================================================ Definitions */

export function FlagDefinitionsTab({ rows, canEdit }: { rows: FlagDef[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<FlagDef | 'new' | null>(null);
  return (
    <Card>
      <CardHeader
        title="Flag definitions"
        description="Every configuration switch a category can set, defined as data. New flags need no code change."
        actions={canEdit ? <Button onClick={() => setEditing('new')}><Plus size={16} /> New flag</Button> : null}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<Flag size={22} />} title="No flags" />
      ) : (
        <Table>
          <THead><TH>Flag</TH><TH>Group</TH><TH>Type</TH><TH className="hidden md:table-cell">Default</TH></THead>
          <TBody>
            {rows.map((f) => (
              <TR key={f.id} className={f.status === 'deprecated' ? 'opacity-60' : ''}>
                <TD>
                  <button type="button" className="text-left" onClick={() => setEditing(f)}>
                    <span className="block font-medium">{f.label}</span>
                    <code className="text-[11px] text-mute">{f.key}</code>
                  </button>
                </TD>
                <TD><Badge>{GROUP_LABEL[f.groupName]}</Badge></TD>
                <TD className="text-mute">{TYPE_LABEL[f.valueType]}</TD>
                <TD className="hidden md:table-cell text-mute">{formatFlagValue(f, f.defaultValue)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {editing ? <FlagDrawer key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} canEdit={canEdit} onClose={() => setEditing(null)} /> : null}
    </Card>
  );
}

function FlagDrawer({ initial, canEdit, onClose }: { initial: FlagDef | null; canEdit: boolean; onClose: () => void }) {
  const [f, setF] = useState({
    label: initial?.label ?? '',
    key: initial?.key ?? '',
    groupName: initial?.groupName ?? 'category',
    ownerModule: initial?.ownerModule ?? 'catalog',
    valueType: (initial?.valueType ?? 'boolean') as FlagValueType,
    options: (initial?.schema.options ?? []).join(', '),
    unit: initial?.schema.unit ?? '',
    min: initial?.schema.min === undefined ? '' : String(initial.schema.min),
    max: initial?.schema.max === undefined ? '' : String(initial.schema.max),
    helpText: initial?.helpText ?? '',
    status: initial?.status ?? 'active',
  });
  const [def, setDef] = useState<unknown>(initial?.defaultValue ?? undefined);
  const schema = useMemo(
    () => ({
      options: splitList(f.options),
      unit: f.unit || undefined,
      min: f.min === '' ? undefined : Number(f.min),
      max: f.max === '' ? undefined : Number(f.max),
    }),
    [f.options, f.unit, f.min, f.max],
  );
  const { pending, run } = useRunner();
  const select = f.valueType === 'single_select' || f.valueType === 'multi_select';
  const numeric = f.valueType === 'number' || f.valueType === 'range';
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? initial.label : 'New flag'}
      width={560}
      footer={
        canEdit ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              loading={pending}
              disabled={!f.label.trim()}
              onClick={() =>
                run(
                  () =>
                    saveFlagDefinitionAction({
                      id: initial?.id,
                      label: f.label,
                      key: f.key || undefined,
                      groupName: f.groupName,
                      ownerModule: f.ownerModule,
                      valueType: f.valueType,
                      schema,
                      defaultValue: def,
                      helpText: f.helpText,
                      status: f.status as 'active',
                    }),
                  onClose,
                )
              }
            >
              Save flag
            </Button>
          </>
        ) : null
      }
    >
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Label" htmlFor="f-label" required><Input id="f-label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
          <Field label="Key" htmlFor="f-key" hint="Optional; derived from the label."><Input id="f-key" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} /></Field>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Group" htmlFor="f-group">
            <Select id="f-group" value={f.groupName} onChange={(e) => setF({ ...f, groupName: e.target.value as FlagDef['groupName'] })}>
              {FLAG_GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
            </Select>
          </Field>
          <Field label="Type" htmlFor="f-type">
            <Select id="f-type" value={f.valueType} onChange={(e) => { setF({ ...f, valueType: e.target.value as FlagValueType }); setDef(undefined); }}>
              {FLAG_VALUE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </Select>
          </Field>
          <Field label="Owner module" htmlFor="f-owner"><Input id="f-owner" value={f.ownerModule} onChange={(e) => setF({ ...f, ownerModule: e.target.value })} /></Field>
        </div>
        {select ? (
          <Field label="Options" htmlFor="f-opts" hint="Comma separated keys, e.g. piece, pack, set.">
            <Input id="f-opts" value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} />
          </Field>
        ) : null}
        {numeric ? (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Unit" htmlFor="f-unit"><Input id="f-unit" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="%" /></Field>
            <Field label="Min" htmlFor="f-min"><Input id="f-min" inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></Field>
            <Field label="Max" htmlFor="f-max"><Input id="f-max" inputMode="decimal" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /></Field>
          </div>
        ) : null}
        <Field label="Default value" htmlFor="f-def" hint="Used when neither a profile nor the category sets it.">
          <FlagValueInput id="f-def" def={{ valueType: f.valueType, schema, label: 'Default' }} value={def} onChange={setDef} />
        </Field>
        <Field label="Help text" htmlFor="f-help"><Textarea id="f-help" value={f.helpText} onChange={(e) => setF({ ...f, helpText: e.target.value })} className="min-h-16" /></Field>
        {initial ? (
          <Field label="Status" htmlFor="f-status"><Select id="f-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as 'active' | 'deprecated' })}><option value="active">Active</option><option value="deprecated">Deprecated</option></Select></Field>
        ) : null}
      </fieldset>
    </Drawer>
  );
}

/* ================================================================ Profiles */

export interface ProfileRow {
  id: string;
  code: string;
  name: string;
  description: string;
  version: number;
  status: string;
  flagCount: number;
}

export function FlagProfilesTab({ rows, defs, canEdit }: { rows: ProfileRow[]; defs: FlagDef[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<ProfileRow | 'new' | null>(null);
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-mute max-w-2xl">
          A profile is a named bundle of flag values. Applying one to a category in R2 means only the flags it leaves out need a decision.
        </p>
        {canEdit ? <Button onClick={() => setEditing('new')}><Plus size={16} /> New profile</Button> : null}
      </div>
      {rows.length === 0 ? (
        <Card><EmptyState icon={<Layers size={22} />} title="No profiles yet" description='Start with one like "Branded electronics".' /></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {rows.map((p) => (
            <button key={p.id} type="button" onClick={() => setEditing(p)} className="text-left rounded-2xl border border-line bg-card p-4 shadow-soft hover:shadow-lift transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <code className="text-[11px] text-mute">{p.code}</code>
                </div>
                <Badge tone="accent">v{p.version}</Badge>
              </div>
              {p.description ? <p className="text-sm text-mute mt-2">{p.description}</p> : null}
              <div className="mt-3 text-xs text-mute">
                Sets {p.flagCount} of {defs.filter((d) => d.status === 'active').length} flags
              </div>
            </button>
          ))}
        </div>
      )}
      {editing ? <ProfileDrawer key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} defs={defs} canEdit={canEdit} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function ProfileDrawer({ initial, defs, canEdit, onClose }: { initial: ProfileRow | null; defs: FlagDef[]; canEdit: boolean; onClose: () => void }) {
  const [meta, setMeta] = useState({ name: initial?.name ?? '', code: initial?.code ?? '', description: initial?.description ?? '', status: initial?.status ?? 'active' });
  const [values, setValues] = useState<Record<string, unknown> | null>(initial ? null : {});
  const { pending, run } = useRunner();
  const active = defs.filter((d) => d.status === 'active');

  useEffect(() => {
    if (!initial) return;
    let live = true;
    getFlagProfileAction(initial.id).then((p: { values: Record<string, unknown> }) => live && setValues(p.values));
    return () => {
      live = false;
    };
  }, [initial]);

  const toggle = (d: FlagDef, on: boolean) =>
    setValues((v) => {
      const next = { ...(v ?? {}) };
      if (on) next[d.key] = d.defaultValue ?? (d.valueType === 'boolean' ? false : undefined);
      else delete next[d.key];
      return next;
    });

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? `${initial.name} · v${initial.version}` : 'New flag profile'}
      description="Tick the flags this profile decides and set their values. Saving creates a new version."
      width={680}
      footer={
        canEdit ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              loading={pending}
              disabled={!meta.name.trim() || !values}
              onClick={() => run(() => saveFlagProfileAction({ id: initial?.id, ...meta, code: meta.code || undefined, status: meta.status as 'active', values: values! }), onClose)}
            >
              Save profile
            </Button>
          </>
        ) : null
      }
    >
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name" htmlFor="p-name" required><Input id="p-name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="Branded electronics" /></Field>
          <Field label="Code" htmlFor="p-code" hint="Optional."><Input id="p-code" value={meta.code} onChange={(e) => setMeta({ ...meta, code: e.target.value })} /></Field>
        </div>
        <Field label="Description" htmlFor="p-desc"><Textarea id="p-desc" value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} className="min-h-16" /></Field>
        {values === null ? (
          <p className="text-sm text-mute">Loading…</p>
        ) : (
          FLAG_GROUPS.map((g) => {
            const inGroup = active.filter((d) => d.groupName === g);
            if (!inGroup.length) return null;
            return (
              <section key={g}>
                <h3 className="text-xs font-medium uppercase tracking-wider text-mute mb-2">{GROUP_LABEL[g]}</h3>
                <div className="space-y-2">
                  {inGroup.map((d) => {
                    const on = d.key in values;
                    return (
                      <div key={d.id} className={`rounded-xl border px-3.5 py-3 ${on ? 'border-accent/40 bg-accent/[.04]' : 'border-line'}`}>
                        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                          <Checkbox checked={on} onChange={(e) => toggle(d, e.target.checked)} className="mt-0.5" />
                          <span>
                            <span className="font-medium">{d.label}</span>
                            {d.helpText ? <span className="block text-xs text-mute">{d.helpText}</span> : null}
                          </span>
                        </label>
                        {on ? (
                          <div className="mt-2.5 pl-6">
                            <FlagValueInput id={`pv-${d.key}`} def={d} value={values[d.key]} onChange={(v) => setValues({ ...values, [d.key]: v })} />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </fieldset>
    </Drawer>
  );
}
