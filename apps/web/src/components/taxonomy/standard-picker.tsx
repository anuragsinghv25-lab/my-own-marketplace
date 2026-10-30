'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronRight, CornerDownRight, Globe, Layers, ListTree, Search, Sparkles } from 'lucide-react';
import type { ReferenceDetail, ReferenceRow, ReferenceSource, StandardStatus } from '@orbita/standards';
import { Badge, Button, Checkbox, Dialog, Field, Input, Radio, Select, Skeleton, Switch, cn } from '@orbita/ui';
import {
  adoptStandardAction,
  browseStandardAction,
  searchStandardAction,
  standardDetailAction,
  standardsStatusAction,
} from '@/app/(app)/workbench/taxonomy/actions';
import { splitList, useRunner } from '@/components/common/use-runner';

export interface PlacementOption {
  id: string;
  label: string;
  /** set when the group was itself adopted: browsing starts there */
  source?: 'custom' | ReferenceSource;
  externalId?: string | null;
  name?: string;
}

const SOURCE_NAMES: Record<ReferenceSource, string> = { shopify: 'Shopify', unspsc: 'UNSPSC' };
const SOURCE_BLURB: Record<ReferenceSource, string> = {
  shopify: 'Shopify Standard Product Taxonomy: consumer and B2B products, with the attributes that describe each category.',
  unspsc: 'United Nations Standard Products and Services Code: the procurement codeset (segment › family › class › commodity).',
};

/** "Add from standard": browse or search Shopify / UNSPSC and adopt categories into the live tree. */
export function StandardPicker({
  under,
  groups,
  canMirror,
  onClose,
}: {
  /** a group of ours the new category goes under; null = follow the standard's own path */
  under: PlacementOption | null;
  groups: PlacementOption[];
  /** may create missing top-level groups (needed to follow the standard's path) */
  canMirror: boolean;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<StandardStatus[] | null>(null);
  const [source, setSource] = useState<ReferenceSource>(under?.source === 'unspsc' ? 'unspsc' : 'shopify');
  const startAt = under?.externalId && under.source === source ? [{ id: under.externalId, name: under.name ?? under.label }] : [];
  const [selected, setSelected] = useState<string | null>(null);

  const fromStandard = !!under?.source && under.source !== 'custom';
  useEffect(() => {
    let live = true;
    standardsStatusAction().then((s) => {
      if (!live) return;
      setStatus(s);
      if (!fromStandard && !s.find((x) => x.source === 'shopify')?.categoryCount && s.find((x) => x.source === 'unspsc')?.categoryCount) setSource('unspsc');
    });
    return () => {
      live = false;
    };
  }, [fromStandard]);
  const current = status?.find((s) => s.source === source);

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add from a standard taxonomy"
      description={under ? `New categories go under ${under.label}.` : 'Pick a ready-made category instead of typing it. Its parents and attributes come along.'}
      className="w-[min(1040px,calc(100vw-2rem))] h-[min(760px,92vh)]"
    >
      <div className="flex flex-wrap items-center gap-2 -mt-1 mb-4" role="tablist" aria-label="Standard">
        {(['shopify', 'unspsc'] as const).map((s) => {
          const st = status?.find((x) => x.source === s);
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={source === s}
              onClick={() => {
                setSource(s);
                setSelected(null);
              }}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3.5 h-9 text-sm transition-colors',
                source === s ? 'border-accent bg-accent/10 text-accent' : 'border-line text-mute hover:text-ink',
              )}
            >
              <Globe size={14} /> {SOURCE_NAMES[s]}
              {st ? (
                <span className="text-[11px] opacity-80">{st.categoryCount ? `${st.categoryCount.toLocaleString()} · ${st.version}` : 'not loaded'}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {!status ? (
        <Skeleton className="h-64" />
      ) : !current?.categoryCount ? (
        <div className="rounded-2xl bg-soft p-8 text-center">
          <Globe size={26} className="mx-auto text-mute" />
          <h3 className="mt-3 font-semibold">{SOURCE_NAMES[source]} is not loaded yet</h3>
          <p className="mt-1 text-sm text-mute max-w-md mx-auto">{SOURCE_BLURB[source]} A platform admin loads it once under Admin › Standard taxonomies.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 min-h-0">
          <Finder key={source} source={source} start={startAt} selected={selected} onSelect={setSelected} partial={source === 'shopify' && !current.complete} />
          {selected ? (
            <Adopt key={source + selected} source={source} externalId={selected} under={under} groups={groups} canMirror={canMirror} onClose={onClose} onOpen={setSelected} />
          ) : (
            <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-mute grid place-items-center">
              <div>
                <ListTree size={22} className="mx-auto mb-2" />
                Search or browse on the left, then pick a category to see its path and attributes.
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function Finder({
  source,
  start,
  selected,
  onSelect,
  partial,
}: {
  source: ReferenceSource;
  start: { id: string; name: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
  partial: boolean;
}) {
  const [q, setQ] = useState('');
  const [trail, setTrail] = useState<{ id: string; name: string }[]>(start);
  const [rows, setRows] = useState<ReferenceRow[] | null>(null);
  const parent = trail.at(-1)?.id ?? null;
  const query = q.trim();

  useEffect(() => {
    let live = true;
    const t = setTimeout(
      async () => {
        const r = query.length >= 2 ? await searchStandardAction(source, query) : await browseStandardAction(source, parent);
        if (live) setRows(r);
      },
      query ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [source, query, parent]);

  return (
    <div className="flex flex-col min-h-0 rounded-2xl border border-line">
      <div className="p-3 border-b border-line">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={source === 'unspsc' ? 'Search by name or code, e.g. 4321' : 'Search, e.g. gaming laptops'}
            className="h-9 pl-8 text-sm"
            aria-label={`Search ${SOURCE_NAMES[source]}`}
            autoFocus
          />
        </div>
        {!query ? (
          <nav className="mt-2 flex flex-wrap items-center gap-1 text-xs text-mute" aria-label="Browse path">
            <button type="button" className={cn('hover:text-ink', !trail.length && 'text-ink font-medium')} onClick={() => setTrail([])}>
              All
            </button>
            {trail.map((t, i) => (
              <span key={t.id} className="inline-flex items-center gap-1">
                <ChevronRight size={11} />
                <button type="button" className={cn('hover:text-ink', i === trail.length - 1 && 'text-ink font-medium')} onClick={() => setTrail(trail.slice(0, i + 1))}>
                  {t.name}
                </button>
              </span>
            ))}
          </nav>
        ) : null}
        {partial ? <p className="mt-2 text-[11px] text-warn">Some verticals are still loading; results may be incomplete.</p> : null}
      </div>
      <ul className="flex-1 overflow-y-auto divide-y divide-line max-h-[52vh]" aria-label="Standard categories">
        {!rows ? (
          <li className="p-3"><Skeleton className="h-24" /></li>
        ) : rows.length === 0 ? (
          <li className="p-6 text-center text-sm text-mute">{query.length >= 2 ? 'Nothing matches.' : 'Type at least two letters.'}</li>
        ) : (
          rows.map((r) => (
            <li key={r.externalId} className={cn('flex items-stretch', selected === r.externalId && 'bg-accent/5')}>
              <button type="button" className="flex-1 min-w-0 px-3 py-2 text-left hover:bg-soft/60" onClick={() => onSelect(r.externalId)}>
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  {r.adoptedNodeId ? <Badge tone="ok" className="shrink-0"><Check size={11} /> In tree</Badge> : null}
                </div>
                <div className="text-[11px] text-mute truncate">
                  {query ? r.fullPath : r.isLeaf ? 'No subcategories' : `${r.childCount} subcategories`}
                  {r.attributeCount ? ` · ${r.attributeCount} attributes` : ''}
                  <code className="ml-1.5">{r.externalId}</code>
                </div>
              </button>
              {!query && r.childCount > 0 ? (
                <button type="button" aria-label={`Open ${r.name}`} className="px-3 text-mute hover:text-ink hover:bg-soft/60" onClick={() => setTrail([...trail, { id: r.externalId, name: r.name }])}>
                  <ChevronRight size={16} />
                </button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function Adopt({
  source,
  externalId,
  under,
  groups,
  canMirror,
  onClose,
  onOpen,
}: {
  source: ReferenceSource;
  externalId: string;
  under: PlacementOption | null;
  groups: PlacementOption[];
  canMirror: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [d, setD] = useState<ReferenceDetail | null>(null);
  const [kind, setKind] = useState<'group' | 'listing'>('listing');
  const [withChildren, setWithChildren] = useState(false);
  const [placement, setPlacement] = useState<string>(under?.id ?? (canMirror ? '' : groups[0]?.id ?? ''));
  const [aliases, setAliases] = useState('');
  const [withAttributes, setWithAttributes] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const { pending, run } = useRunner();

  useEffect(() => {
    let live = true;
    standardDetailAction(source, externalId).then((r) => {
      if (!live) return;
      setD(r);
      if (under?.externalId && r.ancestors.some((a) => a.externalId === under.externalId)) setPlacement('');
      setKind(r.isLeaf ? 'listing' : 'group');
      setAliases(r.isLeaf ? r.name : '');
    });
    return () => {
      live = false;
    };
  }, [source, externalId, under]);

  const missing = useMemo(() => (d ? d.ancestors.filter((a) => !a.adoptedNodeId) : []), [d]);
  /** following the standard's path creates a top-level group when its first ancestor (or itself) is not in the tree */
  const needsRoot = d ? (d.ancestors.length ? !d.ancestors[0]!.adoptedNodeId : true) : false;
  if (!d) return <Skeleton className="h-80" />;

  const bulk = kind === 'group' && withChildren && !d.isLeaf;
  const needsAlias = kind === 'listing' && !splitList(aliases).length;
  const mirror = placement === '';
  const blocked = !!d.adoptedNodeId || needsAlias || (mirror && !canMirror && needsRoot);
  const attrs = showAll ? d.attributes : d.attributes.slice(0, 14);

  return (
    <div className="flex flex-col min-h-0 rounded-2xl border border-line">
      <div className="p-4 border-b border-line">
        <nav className="flex flex-wrap items-center gap-1 text-xs text-mute" aria-label="Standard path">
          {d.ancestors.map((a) => (
            <span key={a.externalId} className="inline-flex items-center gap-1">
              <button type="button" className="hover:text-ink hover:underline" onClick={() => onOpen(a.externalId)}>{a.name}</button>
              {a.adoptedNodeId ? <Check size={11} className="text-ok" aria-label="in your tree" /> : null}
              <ChevronRight size={11} />
            </span>
          ))}
        </nav>
        <h3 className="mt-1 text-xl font-semibold tracking-tight">{d.name}</h3>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge tone="accent">{SOURCE_NAMES[source]}</Badge>
          <Badge><code>{d.externalId}</code></Badge>
          <Badge>{d.levelName}</Badge>
          <Badge>{d.isLeaf ? 'No subcategories' : `${d.childCount} subcategories`}</Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 max-h-[46vh]">
        {d.attributes.length ? (
          <section>
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><Layers size={14} className="text-mute" /> {d.attributes.length} attributes describe these products</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {attrs.map((a) => (
                <span key={a.handle} title={a.values.length ? `${a.description}\n\n${a.values.slice(0, 25).join(', ')}${a.values.length > 25 ? '…' : ''}` : a.description} className="rounded-lg bg-soft px-2 py-1 text-xs">
                  {a.name}
                  {a.values.length ? <span className="text-mute"> · {a.values.length}</span> : null}
                </span>
              ))}
              {d.attributes.length > attrs.length ? (
                <button type="button" className="text-xs text-accent hover:underline" onClick={() => setShowAll(true)}>+{d.attributes.length - attrs.length} more</button>
              ) : null}
            </div>
          </section>
        ) : null}

        {d.adoptedNodeId ? (
          <div className="rounded-xl bg-ok/10 px-4 py-3 text-sm flex items-center gap-2">
            <Check size={16} className="text-ok" /> Already in your tree.
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => {
                onClose();
                router.replace(`${pathname}?node=${d.adoptedNodeId}`, { scroll: false });
              }}
            >
              Open it
            </Button>
          </div>
        ) : (
          <>
            <fieldset>
              <legend className="text-sm font-semibold">Add it as</legend>
              <div className="mt-2 grid sm:grid-cols-2 gap-2">
                {(['listing', 'group'] as const).map((k) => (
                  <label key={k} className={cn('flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer', kind === k ? 'border-accent bg-accent/5' : 'border-line')}>
                    <Radio name="adopt-kind" checked={kind === k} onChange={() => setKind(k)} />
                    <span>
                      <span className="block text-sm font-medium">{k === 'listing' ? 'Listing category' : 'Category group'}</span>
                      <span className="block text-xs text-mute">{k === 'listing' ? 'Sellers list products here. Starts an empty draft v0.' : 'Organises categories under it.'}</span>
                    </span>
                  </label>
                ))}
              </div>
              {kind === 'group' && !d.isLeaf ? (
                <label className="mt-2.5 flex items-center gap-2 text-sm">
                  <Checkbox checked={withChildren} onChange={(e) => setWithChildren(e.target.checked)} />
                  Bring its {d.childCount} subcategories (and theirs) along; leaves become listing categories
                </label>
              ) : null}
            </fieldset>

            <Field label="Where it goes" htmlFor="adopt-place" hint={mirror ? (missing.length ? `Creates ${missing.length} missing parent group${missing.length === 1 ? '' : 's'}: ${missing.map((m) => m.name).join(' › ')}` : 'Its parents are already in your tree.') : 'It goes directly under this group.'}>
              <Select id="adopt-place" value={placement} onChange={(e) => setPlacement(e.target.value)}>
                {canMirror || !needsRoot ? <option value="">Follow the {SOURCE_NAMES[source]} path</option> : null}
                {under ? <option value={under.id}>Under {under.label}</option> : null}
                {groups.filter((g) => g.id !== under?.id).map((g) => <option key={g.id} value={g.id}>Under {g.label}</option>)}
              </Select>
            </Field>

            {kind === 'listing' ? (
              <Field label="Aliases" htmlFor="adopt-aliases" required hint="At least one, unique across the whole tree. Comma separated.">
                <Input id="adopt-aliases" value={aliases} onChange={(e) => setAliases(e.target.value)} />
              </Field>
            ) : bulk ? (
              <p className="text-xs text-mute flex items-start gap-1.5"><CornerDownRight size={13} className="mt-0.5 shrink-0" /> Each listing category gets its name as an alias, or “Name (Parent)” if the name is taken. You can change them later.</p>
            ) : null}

            {source === 'shopify' && d.attributes.length ? (
              <Switch checked={withAttributes} onCheckedChange={setWithAttributes} label={<span>Bring its attributes into the library and attach them <span className="text-mute">(existing ones with the same name are reused)</span></span>} />
            ) : null}
          </>
        )}
      </div>

      {!d.adoptedNodeId ? (
        <div className="border-t border-line p-3 flex items-center justify-end gap-2">
          {mirror && !canMirror && needsRoot ? <span className="text-xs text-warn mr-auto">Pick one of your groups: you cannot create top-level groups.</span> : null}
          <Button
            loading={pending}
            disabled={blocked}
            onClick={() =>
              run(
                () =>
                  adoptStandardAction({
                    source,
                    externalId: d.externalId,
                    parentId: placement || null,
                    kind,
                    withChildren: bulk,
                    aliases: kind === 'listing' ? splitList(aliases) : [],
                    withAttributes,
                  }),
                (s) => {
                  onClose();
                  const id = s.data?.id as string | undefined;
                  if (id) router.replace(`${pathname}?node=${id}`, { scroll: false });
                },
              )
            }
          >
            <Sparkles size={15} /> Add {bulk ? 'branch' : kind === 'listing' ? 'listing category' : 'group'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
