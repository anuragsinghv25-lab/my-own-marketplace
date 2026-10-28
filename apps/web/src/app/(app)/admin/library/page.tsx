import type { Metadata } from 'next';
import { getDb } from '@orbita/db';
import {
  ATTRIBUTE_TYPES,
  listAttributes,
  listBooleanPairs,
  listCertificateTypes,
  listDimensions,
  listSettings,
  listValueLists,
} from '@orbita/library';
import { PageHeader } from '@orbita/ui';
import { TabLinks } from '@/components/common/tab-links';
import { AttributesTab, type AttributeRow } from '@/components/library/attributes-tab';
import { CertificatesTab, LimitsTab, PairsTab, UnitsTab, ValueListsTab } from '@/components/library/other-tabs';
import { requirePermission } from '@/server/session';

export const metadata: Metadata = { title: 'Attribute library' };

const TABS = [
  { key: 'attributes', label: 'Attributes' },
  { key: 'lists', label: 'Value lists' },
  { key: 'units', label: 'Units' },
  { key: 'pairs', label: 'Yes / no labels' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'limits', label: 'Platform limits' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requirePermission('read', 'AttributeLibrary');
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : 'attributes';
  const db = getDb();
  const a = session.ability;
  const canEdit = a.can('update', 'AttributeLibrary');

  let body: React.ReactNode = null;
  if (tab === 'attributes') {
    const type = (ATTRIBUTE_TYPES as readonly string[]).includes(sp.type ?? '') ? sp.type : undefined;
    const status = sp.status === 'active' || sp.status === 'deprecated' ? sp.status : undefined;
    const [rows, lists, pairs, dims] = await Promise.all([
      listAttributes(db, a, { q: sp.q || undefined, dataType: type, status }),
      listValueLists(db, a),
      listBooleanPairs(db, a),
      listDimensions(db, a),
    ]);
    const attrRows: AttributeRow[] = rows.map((r) => ({
      ...r.attribute,
      valueListName: r.valueListName,
      unitSymbol: r.unitSymbol,
      dimensionName: r.dimensionName,
    }));
    body = (
      <AttributesTab
        rows={plain(attrRows)}
        refs={plain({
          lists: lists.filter((l) => l.status === 'active').map((l) => ({ id: l.id, name: l.name, kind: l.kind })),
          pairs: pairs.filter((p) => p.status === 'active'),
          dimensions: dims
            .filter((d) => d.status === 'active')
            .map((d) => ({ id: d.id, name: d.name, units: d.units.filter((u) => u.status === 'active') })),
        })}
        canEdit={canEdit}
        filters={{ q: sp.q ?? '', type: type ?? '', status: status ?? '' }}
      />
    );
  } else if (tab === 'lists') body = <ValueListsTab rows={plain(await listValueLists(db, a))} canEdit={canEdit} />;
  else if (tab === 'units') body = <UnitsTab dimensions={plain(await listDimensions(db, a))} canEdit={canEdit} />;
  else if (tab === 'pairs') body = <PairsTab rows={plain(await listBooleanPairs(db, a))} canEdit={canEdit} />;
  else if (tab === 'certificates') body = <CertificatesTab rows={plain(await listCertificateTypes(db, a))} canEdit={canEdit} />;
  else body = <LimitsTab rows={plain(await listSettings(db, a))} canEdit={canEdit} />;

  return (
    <>
      <PageHeader
        eyebrow="Admin console"
        title="Attribute library"
        description="The building blocks every category is configured from. Define each once; categories reuse them in R2."
      />
      <TabLinks base="/admin/library" current={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label }))} />
      {body}
    </>
  );
}
