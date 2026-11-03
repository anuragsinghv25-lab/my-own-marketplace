/** Pure: the Brand Center's readiness meter runs in the browser and on the server with the same rules. */
export interface ReadinessInput {
  relation: 'owner' | 'manufacturer_for_owner' | 'authorised_reseller' | 'unbranded';
  brandKind: 'registered' | 'unregistered' | 'unbranded';
  trademark: { applicationNumber?: string | null; niceClass?: number | null; ownerName?: string | null; certificateFileId?: string | null } | null;
  categoryNodeIds: string[];
  ownerNameMatches: boolean | null;
  undertakingAccepted: boolean;
  fileIds: string[];
}

export interface Readiness {
  score: number;
  next: string | null;
  checks: { label: string; ok: boolean }[];
}

export function readiness(r: ReadinessInput, ctx: { verified: boolean; hasApprovedVa: boolean }): Readiness {
  const checks: { label: string; ok: boolean; next: string }[] = [{ label: 'Organisation verified', ok: ctx.verified, next: 'Wait for your organisation to be verified.' }];
  checks.push({ label: 'Categories chosen', ok: r.categoryNodeIds.length > 0, next: 'Pick the categories you want to sell this brand in.' });
  if (r.brandKind === 'registered') {
    const t = r.trademark;
    checks.push({ label: 'Trademark details', ok: !!t?.applicationNumber && !!t?.niceClass && !!t?.ownerName, next: 'Fill in the trademark details from the certificate.' });
    checks.push({ label: 'Trademark certificate attached', ok: !!t?.certificateFileId, next: 'Attach the trademark registration certificate.' });
    if (r.ownerNameMatches === false)
      checks.push({ label: 'Proof of your right to the mark', ok: r.fileIds.length > 0, next: 'Your name is not on the certificate: attach an authorisation, assignment or merger document.' });
    else checks.push({ label: 'Owner name confirmed', ok: r.ownerNameMatches === true, next: 'Say whether your name is on the certificate.' });
  }
  if (r.brandKind === 'unregistered') checks.push({ label: 'Undertaking accepted', ok: r.undertakingAccepted, next: 'Accept the undertaking for an unregistered brand.' });
  if (r.brandKind === 'unbranded' || r.relation === 'owner') checks.push({ label: 'Vendor assessment approved', ok: ctx.hasApprovedVa, next: 'Complete the vendor assessment as a manufacturer first.' });
  if (r.relation === 'authorised_reseller' || r.relation === 'manufacturer_for_owner') checks.push({ label: 'Authorisation from the owner attached', ok: r.fileIds.length > 0, next: 'Attach the brand owner’s authorisation letter.' });
  const done = checks.filter((c) => c.ok).length;
  return { score: Math.round((done / checks.length) * 100), next: checks.find((c) => !c.ok)?.next ?? null, checks: checks.map(({ label, ok }) => ({ label, ok })) };
}

