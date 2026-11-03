import type { Metadata } from 'next';
import { Factory } from 'lucide-react';
import { orgAssessments } from '@orbita/brands';
import { getDb } from '@orbita/db';
import { caseTimeline, CASE_SPECS, filesById, getOrg } from '@orbita/sellers';
import { Card, CardHeader, PageHeader } from '@orbita/ui';
import { CaseBadge, CaseHistory } from '@/components/seller/case-status';
import { FileLinks } from '@/components/seller/file-picker';
import { ReplyBox } from '@/components/seller/reply-box';
import { VaForm } from '@/components/seller/va-form';
import { plain } from '@/lib/plain';
import { requireSellerOrg } from '@/server/seller';
import { respondAssessmentAction } from '../actions';

export const metadata: Metadata = { title: 'Vendor assessment' };

const OEM = { oem: 'OEM', deemed_oem: 'Deemed OEM', oem_fabricator: 'OEM fabricator' } as const;

export default async function VendorAssessmentPage() {
  const { session, org, orgId } = await requireSellerOrg();
  const db = getDb();
  const [vas, { addresses }] = await Promise.all([orgAssessments(db, session, orgId), getOrg(db, session, orgId)]);
  const canEdit = session.ability.can('update', 'VendorAssessment');
  const draft = vas.find((v) => v.status === 'draft');
  const others = vas.filter((v) => v !== draft);
  const factories = addresses.filter((a) => a.kind === 'manufacturing').map((a) => ({ id: a.id, label: a.label, city: a.city }));
  const blocks = [];
  for (const v of others) {
    const t = await caseTimeline(db, CASE_SPECS.vendor_assessment, v.id);
    const files = await filesById(db, v.fileIds);
    const ask = t?.request.awaitingReplySince ? t.detail.decisions.filter((d) => d.decision === 'request_info').at(-1) : null;
    blocks.push({ v, t, files, ask });
  }
  const inProgress = others.some((v) => ['submitted', 'info_requested', 'escalated'].includes(v.status));
  return (
    <>
      <PageHeader eyebrow="Seller app" title="Vendor assessment" description="Manufacturers prove what they make and where. Approval makes the brands yours: you then decide who may resell them, and catalogs of your brands come to you for approval in R5." />
      <div className="space-y-4">
        {blocks.map(({ v, t, files, ask }) => (
          <div key={v.id} className="space-y-3">
            {ask ? <ReplyBox orgId={orgId} question={{ by: ask.byName, reason: ask.reasonLabel, note: ask.note }} send={respondAssessmentAction.bind(null, v.id)} /> : null}
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  <Factory size={18} className="text-mute mt-0.5" />
                  <div>
                    <div className="font-medium">{OEM[v.oemType]} for {v.brandNames.join(', ')}</div>
                    <div className="text-sm text-mute">{v.addressIds.length} manufacturing address{v.addressIds.length === 1 ? '' : 'es'}</div>
                  </div>
                </div>
                <CaseBadge status={v.status} />
              </div>
              <div className="mt-3"><FileLinks files={files} /></div>
              {t ? <div className="mt-4 border-t border-line pt-3"><CaseHistory submittedAt={plain(v.submittedAt)} decisions={plain(t.detail.decisions)} /></div> : null}
            </Card>
          </div>
        ))}
        {canEdit && !inProgress ? (
          <Card>
            <CardHeader title={draft ? 'Your draft' : others.length ? 'Add more brands' : 'Start your assessment'} description={org.status === 'verified' ? 'A reviewer checks it, usually within three working days.' : 'You can prepare it now and submit once your organisation is verified.'} />
            <div className="border-t border-line p-5">
              <VaForm
                orgId={orgId}
                addresses={factories}
                canSubmit={org.status === 'verified'}
                initial={draft ? { id: draft.id, oemType: draft.oemType, brandNames: draft.brandNames, addressIds: draft.addressIds, files: plain(await filesById(db, draft.fileIds)), description: draft.description } : { id: null, oemType: 'oem', brandNames: [], addressIds: [], files: [], description: '' }}
              />
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
