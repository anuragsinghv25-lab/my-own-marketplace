'use client';

import { useMemo, useState } from 'react';
import { Plus, Search, Sparkles, Tag } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
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
import { ATTRIBUTE_TYPES, ATTRIBUTE_TYPE_LABELS, LIST_TYPES, NUMBER_TYPES, UNIT_TYPES, type AttributeType } from '@orbita/library/schemas';
import { saveAttributeAction, similarAttributesAction } from '@/app/(app)/admin/library/actions';
import { splitList, useRunner } from '@/components/common/use-runner';

export interface AttributeRow {
  id: string;
  code: string;
  name: string;
  description: string;
  dataType: AttributeType;
  valueListId: string | null;
  booleanPairId: string | null;
  dimensionId: string | null;
  defaultUnitId: string | null;
  validation: Record<string, number | string>;
  synonyms: string[];
  buyerHint: string;
  sellerHint: string;
  status: 'active' | 'deprecated';
  source: 'custom' | 'shopify' | 'unspsc';
  valueListName: string | null;
  unitSymbol: string | null;
  dimensionName: string | null;
}

export interface Refs {
  lists: { id: string; name: string; kind: string }[];
  pairs: { id: string; trueLabel: string; falseLabel: string }[];
  dimensions: { id: string; name: string; units: { id: string; name: string; symbol: string }[] }[];
}

export function AttributesTab({
  rows,
  refs,
  canEdit,
  filters,
}: {
  rows: AttributeRow[];
  refs: Refs;
  canEdit: boolean;
  filters: { q: string; type: string; status: string };
}) {
  const [editing, setEditing] = useState<AttributeRow | 'new' | null>(null);
  return (
    <Card>
      <form className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line" role="search">
        <input type="hidden" name="tab" value="attributes" />
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <Input name="q" defaultValue={filters.q} placeholder="Search name, code or synonym" className="h-10 pl-9" aria-label="Search attributes" />
        </div>
        <Select name="type" defaultValue={filters.type} className="h-10 w-56" aria-label="Type">
          <option value="">All types</option>
          {ATTRIBUTE_TYPES.map((t) => (
            <option key={t} value={t}>
              {ATTRIBUTE_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={filters.status} className="h-10 w-40" aria-label="Status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="deprecated">Deprecated</option>
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {canEdit ? (
          <Button className="ml-auto" onClick={() => setEditing('new')}>
            <Plus size={16} /> New attribute
          </Button>
        ) : null}
      </form>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Tag size={22} />}
          title="No attributes yet"
          description="Attributes are the specifications sellers fill in, like Processor or RAM. Create them once and every category can reuse them."
        />
      ) : (
        <Table>
          <THead>
            <TH>Attribute</TH>
            <TH>Type</TH>
            <TH className="hidden md:table-cell">Values</TH>
            <TH>Status</TH>
          </THead>
          <TBody>
            {rows.map((a) => (
              <TR key={a.id}>
                <TD>
                  <button type="button" className="text-left" onClick={() => setEditing(a)}>
                    <span className="block font-medium">{a.name}</span>
                    <code className="text-[11px] text-mute">{a.code}</code>
                    {a.source !== 'custom' ? <span className="ml-1.5 text-[11px] text-mute">· from {a.source === 'shopify' ? 'Shopify' : 'UNSPSC'}</span> : null}
                  </button>
                </TD>
                <TD className="text-mute">{ATTRIBUTE_TYPE_LABELS[a.dataType]}</TD>
                <TD className="hidden md:table-cell text-mute">{describe(a, refs)}</TD>
                <TD>
                  <Badge tone={a.status === 'active' ? 'ok' : 'neutral'}>{a.status === 'active' ? 'Active' : 'Deprecated'}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {editing ? (
        <AttributeDrawer
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          refs={refs}
          canEdit={canEdit}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

function describe(a: AttributeRow, refs: Refs): string {
  if (a.valueListName) return a.valueListName;
  if (a.unitSymbol) {
    const range = [a.validation.min, a.validation.max].some((x) => x !== undefined)
      ? ` · ${a.validation.min ?? '…'} to ${a.validation.max ?? '…'}`
      : '';
    return `${a.dimensionName} in ${a.unitSymbol}${range}`;
  }
  if (a.booleanPairId) {
    const p = refs.pairs.find((x) => x.id === a.booleanPairId);
    return p ? `${p.trueLabel} / ${p.falseLabel}` : '';
  }
  if (a.dataType === 'text' && a.validation.maxLength) return `up to ${a.validation.maxLength} characters`;
  return '';
}

const num = (v: unknown) => (v === undefined || v === null ? '' : String(v));

function AttributeDrawer({
  initial,
  refs,
  canEdit,
  onClose,
}: {
  initial: AttributeRow | null;
  refs: Refs;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    name: initial?.name ?? '',
    code: initial?.code ?? '',
    description: initial?.description ?? '',
    dataType: (initial?.dataType ?? 'enumerable') as AttributeType,
    valueListId: initial?.valueListId ?? '',
    booleanPairId: initial?.booleanPairId ?? refs.pairs[0]?.id ?? '',
    dimensionId: initial?.dimensionId ?? '',
    defaultUnitId: initial?.defaultUnitId ?? '',
    min: num(initial?.validation.min),
    max: num(initial?.validation.max),
    step: num(initial?.validation.step),
    decimals: num(initial?.validation.decimals),
    maxLength: num(initial?.validation.maxLength),
    regex: String(initial?.validation.regex ?? ''),
    synonyms: (initial?.synonyms ?? []).join(', '),
    sellerHint: initial?.sellerHint ?? '',
    buyerHint: initial?.buyerHint ?? '',
    status: initial?.status ?? 'active',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const [similar, setSimilar] = useState<{ id: string; name: string; code: string }[]>([]);
  const { pending, run } = useRunner();
  const t = f.dataType;
  const units = useMemo(() => refs.dimensions.find((d) => d.id === f.dimensionId)?.units ?? [], [refs, f.dimensionId]);
  const lists = refs.lists.filter((l) =>
    t === 'ordinal' ? l.kind === 'ordinal' : t === 'group_ordinal' ? l.kind === 'group_ordinal' : true,
  );

  const save = () =>
    run(
      () =>
        saveAttributeAction({
          id: initial?.id,
          name: f.name,
          code: f.code || undefined,
          description: f.description,
          dataType: f.dataType,
          valueListId: f.valueListId || null,
          booleanPairId: f.booleanPairId || null,
          dimensionId: f.dimensionId || null,
          defaultUnitId: f.defaultUnitId || null,
          validation: {
            min: f.min === '' ? undefined : Number(f.min),
            max: f.max === '' ? undefined : Number(f.max),
            step: f.step === '' ? undefined : Number(f.step),
            decimals: f.decimals === '' ? undefined : Number(f.decimals),
            maxLength: f.maxLength === '' ? undefined : Number(f.maxLength),
            regex: f.regex || undefined,
          },
          synonyms: splitList(f.synonyms),
          sellerHint: f.sellerHint,
          buyerHint: f.buyerHint,
          status: f.status,
        }),
      onClose,
    );

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? initial.name : 'New attribute'}
      description="A reusable specification. Categories pick attributes from here in R2."
      width={560}
      footer={
        canEdit ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={pending} onClick={save} disabled={!f.name.trim()}>
              Save attribute
            </Button>
          </>
        ) : null
      }
    >
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name" htmlFor="a-name" required>
            <Input
              id="a-name"
              value={f.name}
              onChange={set('name')}
              onBlur={async () => setSimilar(f.name.trim().length >= 3 ? await similarAttributesAction(f.name, initial?.id) : [])}
              placeholder="e.g. RAM (GB)"
            />
          </Field>
          <Field label="Code" htmlFor="a-code" hint="Leave empty to derive it from the name.">
            <Input id="a-code" value={f.code} onChange={set('code')} placeholder="ram_gb" />
          </Field>
        </div>
        {similar.length ? (
          <div className="rounded-xl bg-ai/10 px-4 py-3 text-sm">
            <div className="flex items-center gap-1.5 font-medium text-ai">
              <Sparkles size={15} /> Similar attributes already exist
            </div>
            <p className="text-xs text-mute mt-0.5">Reuse one of these instead of creating a duplicate:</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {similar.map((s) => (
                <Badge key={s.id} tone="ai">
                  {s.name}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        <Field label="Type" htmlFor="a-type">
          <Select id="a-type" value={t} onChange={set('dataType')}>
            {ATTRIBUTE_TYPES.map((x) => (
              <option key={x} value={x}>
                {ATTRIBUTE_TYPE_LABELS[x]}
              </option>
            ))}
          </Select>
        </Field>

        {LIST_TYPES.includes(t) ? (
          <Field
            label="Value list"
            htmlFor="a-list"
            hint={t === 'ordinal' ? 'Only ranked lists are shown.' : t === 'group_ordinal' ? 'Only group-ranked lists are shown.' : 'Create lists on the Value lists tab.'}
          >
            <Select id="a-list" value={f.valueListId} onChange={set('valueListId')}>
              <option value="">Choose a list…</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {t === 'boolean' ? (
          <Field label="Labels" htmlFor="a-pair">
            <Select id="a-pair" value={f.booleanPairId} onChange={set('booleanPairId')}>
              {refs.pairs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.trueLabel} / {p.falseLabel}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {UNIT_TYPES.includes(t) ? (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Dimension" htmlFor="a-dim">
              <Select id="a-dim" value={f.dimensionId} onChange={(e) => setF((s) => ({ ...s, dimensionId: e.target.value, defaultUnitId: '' }))}>
                <option value="">Choose…</option>
                {refs.dimensions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Default unit" htmlFor="a-unit">
              <Select id="a-unit" value={f.defaultUnitId} onChange={set('defaultUnitId')} disabled={!f.dimensionId}>
                <option value="">Choose…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.symbol})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        {NUMBER_TYPES.includes(t) ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Min" htmlFor="a-min"><Input id="a-min" inputMode="decimal" value={f.min} onChange={set('min')} /></Field>
            <Field label="Max" htmlFor="a-max"><Input id="a-max" inputMode="decimal" value={f.max} onChange={set('max')} /></Field>
            <Field label="Step" htmlFor="a-step"><Input id="a-step" inputMode="decimal" value={f.step} onChange={set('step')} /></Field>
            <Field label="Decimals" htmlFor="a-dec"><Input id="a-dec" inputMode="numeric" value={f.decimals} onChange={set('decimals')} /></Field>
          </div>
        ) : null}

        {t === 'text' ? (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Max length" htmlFor="a-len"><Input id="a-len" inputMode="numeric" value={f.maxLength} onChange={set('maxLength')} /></Field>
            <Field label="Pattern (regex)" htmlFor="a-re" hint="Optional, e.g. ^[A-Z0-9-]+$"><Input id="a-re" value={f.regex} onChange={set('regex')} /></Field>
          </div>
        ) : null}

        <Field label="Synonyms" htmlFor="a-syn" hint="Comma separated. Used for search and, from R7, for AI extraction.">
          <Input id="a-syn" value={f.synonyms} onChange={set('synonyms')} placeholder="Memory, System memory" />
        </Field>
        <Field label="Hint for sellers" htmlFor="a-sh">
          <Input id="a-sh" value={f.sellerHint} onChange={set('sellerHint')} placeholder="Installed RAM, not the maximum supported" />
        </Field>
        <Field label="Hint for buyers" htmlFor="a-bh">
          <Input id="a-bh" value={f.buyerHint} onChange={set('buyerHint')} />
        </Field>
        <Field label="Description" htmlFor="a-desc">
          <Textarea id="a-desc" value={f.description} onChange={set('description')} />
        </Field>
        {initial ? (
          <Field label="Status" htmlFor="a-status" hint="Deprecated attributes stay on existing categories but cannot be added to new ones.">
            <Select id="a-status" value={f.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="deprecated">Deprecated</option>
            </Select>
          </Field>
        ) : null}
      </fieldset>
    </Drawer>
  );
}
