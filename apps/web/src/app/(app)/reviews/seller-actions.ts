'use server';

import { claimCases, decideAssessment, decideRequest, reviveBlock, type BrandDecision } from '@orbita/brands';
import { getDb } from '@orbita/db';
import { decideOrgVerification, verifyCertificate, type CaseSubject } from '@orbita/sellers';
import type { ActionState } from '@/lib/action-state';
import { actionCtx, runAction } from '@/server/actions';
import { deliverNotificationEmails } from '@/server/notify';

const db = () => ({ db: getDb() });
const PATH: Record<CaseSubject, string> = { seller_org: '/reviews/sellers', vendor_assessment: '/reviews/vendors', brand_request: '/reviews/brands' };
const DONE: Record<string, string> = { approved: 'Approved.', partially_approved: 'Partly approved.', rejected: 'Rejected.', info_requested: 'Sent to the seller for more information.', escalated: 'Escalated to the approvers.' };

export async function decideCaseAction(subjectType: CaseSubject, subjectId: string, requestId: string, input: BrandDecision): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await actionCtx();
    const status =
      subjectType === 'seller_org'
        ? await decideOrgVerification(db(), ctx, subjectId, input as never)
        : subjectType === 'vendor_assessment'
          ? await decideAssessment(db(), ctx, subjectId, input as never)
          : (await decideRequest(db(), ctx, subjectId, input)).status;
    deliverNotificationEmails();
    return { status: 'ok', message: DONE[status] ?? 'Done.' };
  }, [PATH[subjectType], `${PATH[subjectType]}/${requestId}`, '/reviews/escalations']);
}

export async function claimCaseAction(subjectType: CaseSubject, requestId: string): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await actionCtx();
    await claimCases(db(), ctx, subjectType, [requestId], ctx.actor.id);
    return { status: 'ok', message: 'It is on your worklist.' };
  }, [PATH[subjectType], `${PATH[subjectType]}/${requestId}`]);
}

export async function verifyCertificateAction(id: string, ok: boolean, note: string): Promise<ActionState> {
  return runAction(async () => {
    await verifyCertificate(db(), await actionCtx(), id, { ok, note });
    deliverNotificationEmails();
    return { status: 'ok', message: ok ? 'Verified.' : 'Rejected.' };
  }, ['/reviews/certificates']);
}

export async function reviveBlockAction(id: string, note: string): Promise<ActionState> {
  return runAction(async () => {
    await reviveBlock(db(), await actionCtx(), id, note);
    return { status: 'ok', message: 'Revived: sellers can ask for it again.' };
  }, ['/reviews/escalations']);
}
