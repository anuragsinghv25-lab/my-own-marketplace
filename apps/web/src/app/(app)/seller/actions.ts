'use server';

import {
  decideAuthorisation,
  requestAuthorisation,
  respondAssessment,
  respondRequest,
  revokeAuthorisation,
  saveAssessment,
  saveRequest,
  submitAssessment,
  submitRequest,
  withdrawAssessment,
  withdrawRequest,
  checkBrandName,
  categoriesForClass,
  type RequestInput,
  type VaInput,
} from '@orbita/brands';
import { getDb } from '@orbita/db';
import {
  addAddress,
  addCertificate,
  deleteDivision,
  inviteMember,
  removeAddress,
  removeMember,
  respondOrgVerification,
  saveDivision,
  saveFile,
  updateOrg,
} from '@orbita/sellers';
import type { ActionState } from '@/lib/action-state';
import { actionCtx, runAction } from '@/server/actions';
import { sellerDeps } from '@/server/deps';
import { env } from '@/server/env';
import { deliverNotificationEmails } from '@/server/notify';
import { fileStorage } from '@/server/storage';

const db = () => ({ db: getDb() });
const ok = (message: string, data?: Record<string, unknown>): ActionState => ({ status: 'ok', message, data });
const SELLER = ['/seller', '/seller/organisation', '/seller/brands', '/seller/vendor-assessment', '/seller/certificates', '/seller/oem'];

/** One file from a form (field "file"), stored for the organisation. */
export async function uploadFileAction(orgId: string, form: FormData) {
  return runAction(async () => {
    const f = form.get('file');
    if (!(f instanceof File)) return { status: 'error', message: 'Choose a file.' };
    const row = await saveFile({ db: getDb(), storage: fileStorage() }, await actionCtx(), orgId, { filename: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    return ok('Uploaded.', { id: row.id, filename: row.filename, size: row.size });
  });
}

// ---------------------------------------------------------------- organisation

export async function updateOrgAction(orgId: string, patch: Parameters<typeof updateOrg>[3]) {
  return runAction(async () => {
    await updateOrg(db(), await actionCtx(), orgId, patch);
    return ok('Saved.');
  }, SELLER);
}

export async function addAddressAction(orgId: string, input: Parameters<typeof addAddress>[3]) {
  return runAction(async () => {
    await addAddress(db(), await actionCtx(), orgId, input);
    return ok('Address added.');
  }, SELLER);
}

export async function removeAddressAction(orgId: string, id: string) {
  return runAction(async () => {
    await removeAddress(db(), await actionCtx(), orgId, id);
    return ok('Address removed.');
  }, SELLER);
}

export async function respondVerificationAction(orgId: string, note: string, fileIds: string[]) {
  return runAction(async () => {
    await respondOrgVerification(db(), await actionCtx(), orgId, { note, fileIds });
    deliverNotificationEmails();
    return ok('Reply sent to the reviewer.');
  }, SELLER);
}

export async function inviteMemberAction(orgId: string, input: Parameters<typeof inviteMember>[3]) {
  return runAction(async () => {
    const r = await inviteMember(sellerDeps(), await actionCtx(), orgId, input);
    const link = r.manualLink && env.demoMode() ? r.manualLink : null;
    return ok(r.manualLink ? 'User added. Email is not set up, so share the invite link yourself.' : 'Invite sent.', { link });
  }, ['/seller/organisation']);
}

export async function removeMemberAction(orgId: string, userId: string) {
  return runAction(async () => {
    await removeMember(db(), await actionCtx(), orgId, userId);
    return ok('Removed from the organisation.');
  }, ['/seller/organisation']);
}

export async function saveDivisionAction(orgId: string, divisionId: string | null, input: Parameters<typeof saveDivision>[4]) {
  return runAction(async () => {
    await saveDivision(db(), await actionCtx(), orgId, divisionId, input);
    return ok(divisionId ? 'Division saved.' : 'Division created.');
  }, ['/seller/organisation']);
}

export async function deleteDivisionAction(orgId: string, divisionId: string) {
  return runAction(async () => {
    await deleteDivision(db(), await actionCtx(), orgId, divisionId);
    return ok('Division deleted.');
  }, ['/seller/organisation']);
}

// ---------------------------------------------------------------- certificates

export async function addCertificateAction(orgId: string, input: Parameters<typeof addCertificate>[3]) {
  return runAction(async () => {
    await addCertificate(db(), await actionCtx(), orgId, input);
    return ok('Certificate added. A reviewer will verify it.');
  }, ['/seller/certificates']);
}

// ---------------------------------------------------------------- vendor assessment

export async function saveAssessmentAction(orgId: string, id: string | null, input: VaInput, submit: boolean) {
  return runAction(async () => {
    const ctx = await actionCtx();
    const va = await saveAssessment(db(), ctx, orgId, id, input);
    if (submit) {
      await submitAssessment(db(), ctx, va.id);
      deliverNotificationEmails();
    }
    return ok(submit ? 'Submitted for vendor assessment.' : 'Draft saved.', { id: va.id });
  }, SELLER);
}

export async function respondAssessmentAction(id: string, note: string, fileIds: string[]) {
  return runAction(async () => {
    await respondAssessment(db(), await actionCtx(), id, { note, fileIds });
    deliverNotificationEmails();
    return ok('Reply sent to the reviewer.');
  }, SELLER);
}

export async function withdrawAssessmentAction(id: string) {
  return runAction(async () => {
    await withdrawAssessment(db(), await actionCtx(), id);
    return ok('Withdrawn.');
  }, SELLER);
}

// ---------------------------------------------------------------- brand center

export async function checkBrandNameAction(name: string) {
  await actionCtx();
  const c = await checkBrandName(getDb(), name);
  return JSON.parse(JSON.stringify(c)) as typeof c;
}

export async function categoriesForClassAction(niceClass: number) {
  await actionCtx();
  return categoriesForClass(getDb(), niceClass);
}

export async function saveRequestAction(orgId: string, id: string | null, input: RequestInput, submit: boolean) {
  return runAction(async () => {
    const ctx = await actionCtx();
    const rid = await saveRequest(db(), ctx, orgId, id, input);
    if (!submit) return ok('Draft saved.', { id: rid });
    const r = await submitRequest(db(), ctx, rid);
    deliverNotificationEmails();
    return ok(
      r.status === 'approved' ? `Approved automatically: the same trademark is already approved for you.` : r.autoApproved ? `Submitted. ${r.autoApproved} categor${r.autoApproved === 1 ? 'y was' : 'ies were'} approved automatically; a reviewer checks the rest.` : 'Submitted for review.',
      { id: rid },
    );
  }, SELLER);
}

export async function respondRequestAction(id: string, note: string, fileIds: string[]) {
  return runAction(async () => {
    await respondRequest(db(), await actionCtx(), id, { note, fileIds });
    deliverNotificationEmails();
    return ok('Reply sent to the reviewer.');
  }, [...SELLER, `/seller/brands/requests/${id}`]);
}

export async function withdrawRequestAction(id: string) {
  return runAction(async () => {
    const r = await withdrawRequest(db(), await actionCtx(), id);
    return ok(r === 'deleted' ? 'Draft deleted.' : 'Withdrawn.');
  }, SELLER);
}

export async function requestAuthorisationAction(orgId: string, input: Parameters<typeof requestAuthorisation>[3]) {
  return runAction(async () => {
    await requestAuthorisation(db(), await actionCtx(), orgId, input);
    deliverNotificationEmails();
    return ok('Request sent to the brand owner.');
  }, SELLER);
}

export async function decideAuthorisationAction(id: string, input: Parameters<typeof decideAuthorisation>[3]) {
  return runAction(async () => {
    await decideAuthorisation(db(), await actionCtx(), id, input);
    deliverNotificationEmails();
    return ok(input.grant ? 'Authorisation granted.' : 'Declined.');
  }, SELLER);
}

export async function revokeAuthorisationAction(id: string, note: string) {
  return runAction(async () => {
    await revokeAuthorisation(db(), await actionCtx(), id, note);
    deliverNotificationEmails();
    return ok('Authorisation revoked.');
  }, SELLER);
}
