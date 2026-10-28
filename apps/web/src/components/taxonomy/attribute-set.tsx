'use client';

import { useEffect, useState } from 'react';
import { CornerLeftUp, Layers, Plus, Search, X } from 'lucide-react';
import type { CategoryAttributeView } from '@orbita/taxonomy';
import { Badge, Button, Card, Checkbox, Dialog, Input, Skeleton, Switch } from '@orbita/ui';
import {
  addCategoryAttributeAction,
  attributeSetAction,
  removeCategoryAttributeAction,
  searchLibraryAttributesAction,
  updateCategoryAttributeAction,
} from '@/app/(app)/workbench/taxonomy/actions';
import { useRunner } from '@/components/common/use-runner';

const TYPE_LABEL: Record<string, string> = {
  boolean: 'Yes / no',
  enumerable: 'One of a list',
  multi_enumerable: 'Several of a list',
  ordinal: 'Ranked list',
  group_ordinal: 'Grouped ranks',
  numeric: 'Number',
  numeric_range: 'Number range',
  measurable: 'Measurement',
  measurable_range: 'Measurement range',
  text: 'Text',
  key_value: 'Key / value',
};
const ORIGIN: Record<string, string> = { shopify: 'Shopify', unspsc: 'UNSPSC' };

/** The attributes that describe products in this category: its own plus those inherited from its parents. */
export function AttributeSetCard({ nodeId, nodeName, canEdit, version }: { nodeId: string; nodeName: string; canEdit: boolean; version: number }) {
  const [rows, setRows] = useState<CategoryAttributeView[] | null>(null);
  const [tick, setTick] = useState(0);
  const { pending, run } = useRunner();
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let live = true;
    attributeSetAction(nodeId).then((r) => live && setRows(r));
    return () => {
      live = false;
    };
  }, [nodeId, tick, version]);

  const own = rows?.filter((r) => !r.inheritedFrom) ?? [];
  const inherited = rows?.filter((r) => r.inheritedFrom) ?? [];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <h3 className="font-semibold flex items-center gap-1.5"><Layers size={16} className="text-mute" /> Attributes</h3>
          <p className="text-xs text-mute">What describes products in {nodeName}. Subcategories inherit them; R2 starts the spec sheet from this set.</p>
        </div>
        {canEdit ? <AddAttribute nodeId={nodeId} taken={new Set(rows?.map((r) => r.attributeId))} onAdded={reload} /> : null}
      </div>
      {!rows ? (
        <div className="px-5 pb-5"><Skeleton className="h-20" /></div>
      ) : rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-mute">No attributes yet.{canEdit ? ' Add them from the library, or adopt a Shopify category to bring its set along.' : ''}</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {[...own, ...inherited].map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
              <div className="flex-1 min-w-[180px]">
                <div className="text-sm font-medium">{r.name}</div>
                <div className="text-[11px] text-mute">
                  {TYPE_LABEL[r.dataType] ?? r.dataType}
                  {ORIGIN[r.origin] ? ` · from ${ORIGIN[r.origin]}` : ''}
                </div>
              </div>
              {r.inheritedFrom ? (
                <Badge className="gap-1"><CornerLeftUp size={11} /> {r.inheritedFrom}</Badge>
              ) : null}
              {canEdit && !r.inheritedFrom ? (
                <>
                  <Switch
                    checked={r.required}
                    onCheckedChange={(v) => run(() => updateCategoryAttributeAction(nodeId, r.id, v), reload)}
                    label={<span className="text-xs text-mute">Required</span>}
                  />
                  <Button size="icon" variant="ghost" aria-label={`Remove ${r.name}`} loading={pending} onClick={() => run(() => removeCategoryAttributeAction(nodeId, r.id), reload)}>
                    <X size={14} />
                  </Button>
                </>
              ) : r.required ? (
                <Badge tone="warn">Required</Badge>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AddAttribute({ nodeId, taken, onAdded }: { nodeId: string; taken: Set<string>; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [required, setRequired] = useState(false);
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchLibraryAttributesAction>>>([]);
  const { pending, run } = useRunner();

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchLibraryAttributesAction(q.trim());
      if (live) setResults(r);
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, open]);

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus size={14} /> Add attribute</Button>
      {open ? (
        <Dialog open onOpenChange={setOpen} title="Add an attribute" description="From the attribute library. New attributes are created by the platform admin.">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library" className="pl-9" autoFocus aria-label="Search attributes" />
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <Checkbox checked={required} onChange={(e) => setRequired(e.target.checked)} /> Sellers must fill it in
          </label>
          <ul className="mt-3 divide-y divide-line">
            {results.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{r.name} {r.source !== 'custom' ? <span className="text-[11px] text-mute">· {ORIGIN[r.source]}</span> : null}</div>
                  <div className="text-xs text-mute">{TYPE_LABEL[r.dataType] ?? r.dataType} · <code>{r.code}</code></div>
                </div>
                {taken.has(r.id) ? (
                  <Badge>Already in set</Badge>
                ) : (
                  <Button size="sm" loading={pending} onClick={() => run(() => addCategoryAttributeAction(nodeId, r.id, required), () => { setOpen(false); onAdded(); })}>Add</Button>
                )}
              </li>
            ))}
          </ul>
        </Dialog>
      ) : null}
    </>
  );
}
