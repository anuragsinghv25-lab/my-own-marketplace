import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { defineAbilityFor, type Grant } from '@orbita/authz';
import { freshTestDb, testDatabaseUrl } from '@orbita/db/test-support';
import { isAppError } from '@orbita/domain';
import { listNotifications } from '@orbita/notifications';
import {
  addAddress,
  databaseStorage,
  decideOrgVerification,
  getOrg,
  gstinCheckChar,
  gstinProblem,
  inviteMember,
  listMembers,
  readFile,
  saveDivision,
  saveFile,
  purgeUnverifiedSignups,
  resendSignupCode,
  signUpSeller,
  verifySignupCode,
  startOrgVerification,
  type Ctx,
  type SellerDeps,
} from '@orbita/sellers';
import { createNode } from '@orbita/taxonomy';
import {
  addProhibited,
  categoriesForClass,
  checkBrandName,
  claimCases,
  decideAssessment,
  decideAuthorisation,
  decideRequest,
  escalations,
  listBlocks,
  oemDashboard,
  orgApprovals,
  requestAuthorisation,
  respondRequest,
  reviveBlock,
  saveAssessment,
  saveRequest,
  sellerCase,
  sellerQueue,
  setTrademarkClasses,
  submitAssessment,
  submitRequest,
} from '../src';

const meta = { requestId: 'req_r4', ip: '203.0.113.7' };
const code = (e: unknown) => (isAppError(e) ? e.code : String(e));
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46]);
const gstin = (state: string, pan: string) => `${state}${pan}1Z${gstinCheckChar(`${state}${pan}1Z`)}`;

describe.skipIf(!testDatabaseUrl)('R4 · sellers and brands (Postgres)', () => {
  let t: Awaited<ReturnType<typeof freshTestDb>>;
  const sent: { to: string; url?: string; code?: string }[] = [];
  const confirmed = new Set<string>();
  const deps = (): SellerDeps => ({
    db: t.db,
    appUrl: 'https://orbita.test',
    auth: {
      invite: async (email) => {
        const id = randomUUID();
        await t.db.execute(sql`insert into auth.users (id, email) values (${id}, ${email})`);
        return { userId: id, link: { tokenHash: `h_${id}`, type: 'invite' } };
      },
      createUnconfirmed: async (email) => {
        const id = randomUUID();
        await t.db.execute(sql`insert into auth.users (id, email) values (${id}, ${email})`);
        return { userId: id };
      },
      confirmEmail: async (id) => void confirmed.add(id),
      delete: async (id) => void (await t.db.execute(sql`delete from auth.users where id = ${id}`)),
    },
    mailer: {
      sendSignupCode: async (e) => (sent.push({ to: e.to, code: e.code }), { delivered: true }),
      sendInvite: async (e) => (sent.push({ to: e.to, url: e.url }), { delivered: true }),
    },
  });
  const db = () => ({ db: t.db });
  const storage = () => ({ db: t.db, storage: databaseStorage(t.db) });

  /** A context built from the grants in the database, so derived grants (brand owner) count. */
  async function ctxFor(email: string): Promise<Ctx> {
    const [p] = await t.db.execute<{ id: string; full_name: string }>(sql`select id, full_name from profiles where email = ${email}`);
    const grants = await t.db.execute<{ role: Grant['role']; scope_type: Grant['scopeType']; scope_id: string | null }>(sql`select role, scope_type, scope_id from role_grants where user_id = ${p!.id} and revoked_at is null`);
    return { actor: { id: p!.id, email, fullName: p!.full_name }, ability: defineAbilityFor({ userId: p!.id, grants: grants.map((g) => ({ role: g.role, scopeType: g.scope_type, scopeId: g.scope_id })) }), meta };
  }
  async function staff(name: string, role: Grant['role']) {
    const id = randomUUID();
    await t.db.execute(sql`insert into auth.users (id, email) values (${id}, ${name + '@orbita.test'})`);
    await t.db.execute(sql`insert into profiles (id, email, full_name, status) values (${id}, ${name + '@orbita.test'}, ${name}, 'active')`);
    await t.db.execute(sql`insert into role_grants (user_id, role, scope_type) values (${id}, ${role}, 'global')`);
  }
  const activate = (email: string) => t.db.execute(sql`update profiles set status = 'active' where email = ${email}`);

  let oemOrg: string, resellerOrg: string, gamingId: string, businessId: string, vaId: string, requestId: string;
  const oem = { legalName: 'Novara Devices Private Limited', businessType: 'private_limited' as const, gstin: gstin('29', 'AABCN5678F'), contactName: 'Meera Rao', email: 'meera@novara.test', phone: '98450 12345', address: { line1: '12 Industrial Area', city: 'Bengaluru', pincode: '560058' }, password: 'novara-2026', acceptTerms: true as const };

  beforeAll(async () => {
    t = await freshTestDb('r4');
    await staff('admin', 'platform_admin');
    await staff('cm', 'category_manager');
    await staff('reviewer', 'reviewer');
    await staff('approver', 'approver');
    const cm = await ctxFor('cm@orbita.test');
    const electronics = await createNode(db(), cm, { name: 'Electronics' });
    gamingId = (await createNode(db(), cm, { parentId: electronics.node.id, kind: 'listing', name: 'Gaming laptops', aliases: ['Gaming notebooks'] })).node.id;
    businessId = (await createNode(db(), cm, { parentId: electronics.node.id, kind: 'listing', name: 'Business laptops', aliases: ['Office notebooks'] })).node.id;
    await setTrademarkClasses(db(), cm, electronics.node.id, [9]);
  });
  afterAll(async () => t?.drop());

  it('India identity: GSTIN checksum and PAN are checked', () => {
    expect(gstinProblem('27AAPFU0939F1ZV')).toBeNull();
    expect(gstinProblem('27AAPFU0939F1ZX')).toMatch(/check character/);
    expect(gstinProblem('99AAPFU0939F1ZV')).toMatch(/not a GST state code/);
    expect(gstinProblem('27AAPFU0939')).toMatch(/15 characters/);
  });

  it('exit demo 1: a seller registers, is verified, adds two users and a division', async () => {
    await expect(signUpSeller(deps(), meta, { ...oem, gstin: '29AABCN5678F1ZX' })).rejects.toThrow(/check character/);
    const res = await signUpSeller(deps(), meta, oem);
    expect(res).toMatchObject({ delivered: true, code: null });
    const first = sent.at(-1)!.code!;
    expect(first).toMatch(/^[0-9]{6}$/);
    oemOrg = res.orgId;
    await expect(signUpSeller(deps(), { ...meta, ip: '203.0.113.8' }, { ...oem, email: 'other@novara.test' })).rejects.toThrow(/GSTIN is already registered/);
    await expect(signUpSeller(deps(), { ...meta, ip: '203.0.113.9' }, { ...oem, gstin: gstin('29', 'AABCN9999F') })).rejects.toThrow(/waiting for its code/);
    // a wrong code counts; resending too soon is refused; the code is never stored as such
    const wrong = first === '000000' ? '111111' : '000000';
    await expect(verifySignupCode(deps(), meta, { email: oem.email, code: wrong })).rejects.toThrow(/not right/);
    await expect(resendSignupCode(deps(), { email: oem.email })).rejects.toThrow(/Wait a minute/);
    const [stored] = await t.db.execute<{ code_hash: string; attempts: number }>(sql`select code_hash, attempts from signup_codes where email = ${oem.email}`);
    expect(stored).toMatchObject({ attempts: 1 });
    expect(stored!.code_hash).not.toContain(first);
    // the right code confirms the email, activates the account and starts verification for reviewers
    const v = await verifySignupCode(deps(), meta, { email: oem.email, code: first });
    expect(confirmed.has(v.userId)).toBe(true);
    await expect(verifySignupCode(deps(), meta, { email: oem.email, code: first })).rejects.toThrow(/not right/);
    const meera = await ctxFor(oem.email);
    expect(await startOrgVerification(t.db, meera.actor, meta)).toBe(1); // idempotent: no second review
    const reviewer = await ctxFor('reviewer@orbita.test');
    const queue = await sellerQueue(t.db, reviewer, 'seller_org', 'queue');
    expect(queue.map((q) => q.title)).toEqual(['Novara Devices Private Limited']);
    expect((await getOrg(t.db, meera, oemOrg)).org).toMatchObject({ status: 'pending', pan: 'AABCN5678F', stateCode: '29' });
    await expect(submitAssessment(db(), meera, randomUUID())).rejects.toSatisfy((e) => code(e) === 'NOT_FOUND');
    await decideOrgVerification(db(), reviewer, oemOrg, { decision: 'approve' });
    expect((await getOrg(t.db, meera, oemOrg)).org.status).toBe('verified');
    expect((await listNotifications(t.db, meera.actor)).items[0]).toMatchObject({ kind: 'seller_org.approve' });

    const a = await inviteMember(deps(), meera, oemOrg, { email: 'arjun@novara.test', fullName: 'Arjun', role: 'seller_staff' });
    await inviteMember(deps(), meera, oemOrg, { email: 'sara@novara.test', fullName: 'Sara', role: 'seller_admin' });
    await saveDivision(db(), meera, oemOrg, null, { name: 'Laptops', categoryNodeIds: [gamingId], memberIds: [a.userId] });
    const m = await listMembers(t.db, meera, oemOrg);
    expect(m.members.map((x) => `${x.name}:${x.role}`).sort()).toEqual(['Arjun:seller_staff', 'Meera Rao:seller_admin', 'Sara:seller_admin']);
    expect(m.divisions).toMatchObject([{ name: 'Laptops', memberCount: 1 }]);
    // staff cannot manage users
    await activate('arjun@novara.test');
    await expect(inviteMember(deps(), await ctxFor('arjun@novara.test'), oemOrg, { email: 'x@novara.test', fullName: 'X', role: 'seller_staff' })).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
  });

  it('exit demo 2: vendor assessment as OEM for NOVARA; the reviewer approves', async () => {
    const meera = await ctxFor(oem.email);
    const plant = await addAddress(db(), meera, oemOrg, { kind: 'manufacturing', label: 'Plant 1', line1: 'Plot 4, Electronics City', city: 'Bengaluru', stateCode: '29', pincode: '560100' });
    const evidence = await saveFile(storage(), meera, oemOrg, { filename: 'factory-licence.pdf', bytes: PDF });
    await expect(saveFile(storage(), meera, oemOrg, { filename: 'x.pdf', bytes: new Uint8Array([0x4d, 0x5a, 0, 0]) })).rejects.toThrow(/Upload a PDF/);
    const va = await saveAssessment(db(), meera, oemOrg, null, { oemType: 'oem', brandNames: ['NOVARA'], addressIds: [plant.id], fileIds: [evidence.id], description: 'We assemble gaming laptops.' });
    vaId = va.id;
    await submitAssessment(db(), meera, vaId);
    const reviewer = await ctxFor('reviewer@orbita.test');
    const [row] = await sellerQueue(t.db, reviewer, 'vendor_assessment', 'queue');
    expect(row!.title).toBe('Novara Devices Private Limited · OEM for NOVARA');
    await claimCases(db(), reviewer, 'vendor_assessment', [row!.id], reviewer.actor.id);
    // the reviewer can open the evidence; another organisation cannot
    expect((await readFile(storage(), reviewer, evidence.id)).file.filename).toBe('factory-licence.pdf');
    expect(await decideAssessment(db(), reviewer, vaId, { decision: 'approve' })).toBe('approved');
    const brand = await checkBrandName(t.db, 'Nova Ra');
    expect(brand.existing).toMatchObject({ name: 'NOVARA', ownerOrgId: oemOrg });
    const grants = await t.db.execute<{ email: string }>(sql`select p.email from role_grants g join profiles p on p.id = g.user_id where g.role = 'brand_owner' and g.revoked_at is null order by p.email`);
    expect(grants.map((g) => g.email)).toEqual(['meera@novara.test', 'sara@novara.test']);
  });

  it('exit demo 3: NOVARA (registered, class 9) for Gaming laptops; info asked, answered, approved', async () => {
    const meera = await ctxFor(oem.email);
    expect((await categoriesForClass(t.db, 9)).map((c) => c.name)).toEqual(['Business laptops', 'Gaming laptops']);
    const cert = await saveFile(storage(), meera, oemOrg, { filename: 'tm-certificate.pdf', bytes: PDF });
    requestId = await saveRequest(db(), meera, oemOrg, null, {
      brandName: 'NOVARA',
      relation: 'owner',
      brandKind: 'registered',
      trademark: { markType: 'word', applicationNumber: '5123456', niceClass: 9, ownerName: 'Novara Devices Private Limited', validUntil: '2033-01-31', certificateFileId: cert.id },
      categoryNodeIds: [gamingId],
      ownerNameMatches: true,
    });
    await submitRequest(db(), meera, requestId);
    const reviewer = await ctxFor('reviewer@orbita.test');
    await expect(decideRequest(db(), reviewer, requestId, { decision: 'request_info', reasonCode: 'trademark_mismatch', note: '' })).rejects.toThrow(/Add a note/);
    await decideRequest(db(), reviewer, requestId, { decision: 'request_info', reasonCode: 'trademark_mismatch', note: 'Please upload the page showing class 9.' });
    expect((await sellerQueue(t.db, reviewer, 'brand_request', 'queue'))).toHaveLength(0); // waiting on the seller
    await expect(decideRequest(db(), reviewer, requestId, { decision: 'approve' })).rejects.toThrow(/waiting for a reply/);
    const page = await saveFile(storage(), meera, oemOrg, { filename: 'class-9-page.pdf', bytes: PDF });
    await respondRequest(db(), meera, requestId, { note: 'Attached the class 9 page.', fileIds: [page.id] });
    expect((await decideRequest(db(), reviewer, requestId, { decision: 'approve' })).status).toBe('approved');
    expect((await orgApprovals(t.db, meera, oemOrg)).map((a) => `${a.brandName}/${a.categoryName}/${a.source}`)).toEqual(['NOVARA/Gaming laptops/review']);
    const c = await sellerCase(t.db, reviewer, 'brand_request', (await sellerQueue(t.db, reviewer, 'brand_request', 'all'))[0]!.id);
    expect(c.decisions.map((d) => d.decision)).toEqual(['request_info', 'respond', 'approve']);
  });

  it('exit demo 4: a reseller asks; the OEM grants Gaming laptops in North and Central zones', async () => {
    const r = await signUpSeller(deps(), { ...meta, ip: '198.51.100.4' }, { legalName: 'Pixel Retail LLP', businessType: 'llp', gstin: gstin('07', 'AAQFP1234K'), contactName: 'Kabir', email: 'kabir@pixel.test', phone: '+91 99100 55555', address: { line1: '5 Nehru Place', city: 'New Delhi', pincode: '110019' }, password: 'pixel-retail-1', acceptTerms: true });
    resellerOrg = r.orgId;
    // verification has not started yet: the code confirms the email first
    await t.db.execute(sql`update signup_codes set last_sent_at = now() - interval '2 minutes' where email = 'kabir@pixel.test'`);
    await resendSignupCode(deps(), { email: 'kabir@pixel.test' });
    await verifySignupCode(deps(), meta, { email: 'kabir@pixel.test', code: sent.at(-1)!.code! });
    const kabir = await ctxFor('kabir@pixel.test');
    const [brand] = await t.db.execute<{ id: string }>(sql`select id from brands where name = 'NOVARA'`);
    await expect(requestAuthorisation(db(), kabir, resellerOrg, { brandId: brand!.id, categoryIds: [gamingId] })).rejects.toThrow(/still being verified/);
    await startOrgVerification(t.db, kabir.actor, meta);
    await decideOrgVerification(db(), await ctxFor('reviewer@orbita.test'), resellerOrg, { decision: 'approve' });
    // the Brand Center sends a reseller of an on-platform brand to the owner, not to a reviewer
    await expect(saveRequest(db(), kabir, resellerOrg, null, { brandName: 'Novara', relation: 'authorised_reseller', brandKind: 'registered', categoryNodeIds: [gamingId] })).rejects.toThrow(/owner is on Orbita/);
    const auth = await requestAuthorisation(db(), kabir, resellerOrg, { brandId: brand!.id, categoryIds: [gamingId, businessId], message: 'We run 40 stores in Delhi NCR.' });
    const meera = await ctxFor(oem.email);
    const dash = await oemDashboard(t.db, meera, oemOrg);
    expect(dash.pending).toMatchObject([{ resellerName: 'Pixel Retail LLP', brandName: 'NOVARA', canDecide: true }]);
    // staff of the OEM see it but cannot decide; the reseller cannot either
    await expect(decideAuthorisation(db(), await ctxFor('arjun@novara.test'), auth.id, { grant: true, categoryIds: [gamingId] })).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    await expect(decideAuthorisation(db(), kabir, auth.id, { grant: true, categoryIds: [gamingId] })).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    await decideAuthorisation(db(), meera, auth.id, { grant: true, categoryIds: [gamingId], regions: ['North', 'Central'], validUntil: '2027-12-31' });
    expect(await orgApprovals(t.db, kabir, resellerOrg)).toMatchObject([{ brandName: 'NOVARA', categoryName: 'Gaming laptops', relation: 'authorised_reseller', source: 'owner_authorisation', regions: ['North', 'Central'], validUntil: '2027-12-31' }]);
    expect((await oemDashboard(t.db, meera, oemOrg)).resellers).toHaveLength(1);
  });

  it('exit demo 5: a second category in class 9 is auto-approved', async () => {
    const meera = await ctxFor(oem.email);
    const cert = await saveFile(storage(), meera, oemOrg, { filename: 'tm.pdf', bytes: PDF });
    const id = await saveRequest(db(), meera, oemOrg, null, {
      brandName: 'NOVARA',
      relation: 'owner',
      brandKind: 'registered',
      trademark: { markType: 'word', applicationNumber: '5123456', niceClass: 9, ownerName: 'Novara Devices Private Limited', certificateFileId: cert.id },
      categoryNodeIds: [businessId],
      ownerNameMatches: true,
    });
    expect(await submitRequest(db(), meera, id)).toEqual({ status: 'approved', autoApproved: 1 });
    expect((await orgApprovals(t.db, meera, oemOrg)).map((a) => `${a.categoryName}/${a.source}`)).toEqual(['Business laptops/auto', 'Gaming laptops/review']);
    expect((await listNotifications(t.db, meera.actor)).items[0]).toMatchObject({ kind: 'brand_request.auto_approved' });
  });

  it('prohibited names, escalation to an approver, brand blocks and revival', async () => {
    const admin = await ctxFor('admin@orbita.test');
    await addProhibited(db(), admin, { name: 'Gamerz Pro', list: 'legally_rejected', reason: 'Court order 2025' });
    expect((await checkBrandName(t.db, 'gamerz-pro')).problem).toMatch(/rejected as a brand by a court/);
    expect((await checkBrandName(t.db, 'Generic')).problem).toMatch(/is not a brand/);

    const kabir = await ctxFor('kabir@pixel.test');
    const letter = await saveFile(storage(), kabir, resellerOrg, { filename: 'letter.pdf', bytes: PDF });
    const id = await saveRequest(db(), kabir, resellerOrg, null, { brandName: 'Zentrix', relation: 'authorised_reseller', brandKind: 'unregistered', undertakingAccepted: true, categoryNodeIds: [gamingId], fileIds: [letter.id] });
    await submitRequest(db(), kabir, id);
    const reviewer = await ctxFor('reviewer@orbita.test');
    // a reviewer cannot block a brand for everyone: that is an approver's call
    await expect(decideRequest(db(), reviewer, id, { decision: 'reject', reasonCode: 'infringing', note: 'Copies the ZENITH mark.' })).rejects.toThrow(/needs an approver/);
    await decideRequest(db(), reviewer, id, { decision: 'escalate', reasonCode: 'needs_senior', note: 'Looks like it copies ZENITH.' });
    const approver = await ctxFor('approver@orbita.test');
    expect((await escalations(t.db, approver)).map((e) => e.kind)).toEqual(['brand request']);
    await expect(decideRequest(db(), reviewer, id, { decision: 'approve' })).rejects.toThrow(/an approver decides it/);
    expect((await decideRequest(db(), approver, id, { decision: 'reject', reasonCode: 'infringing', note: 'Copies the ZENITH mark.' })).status).toBe('rejected');
    const blocks = await listBlocks(t.db, approver);
    expect(blocks.map((b) => `${b.brandName}/${b.categoryName}`)).toEqual(['Zentrix/Gaming laptops']);
    // nobody can ask for it there now
    const again = await saveRequest(db(), kabir, resellerOrg, null, { brandName: 'Zentrix', relation: 'authorised_reseller', brandKind: 'unregistered', undertakingAccepted: true, categoryNodeIds: [gamingId], fileIds: [letter.id] });
    await expect(submitRequest(db(), kabir, again)).rejects.toThrow(/blocked in Gaming laptops/);
    await expect(reviveBlock(db(), reviewer, blocks[0]!.b.id, 'Court ruled for Zentrix')).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    await reviveBlock(db(), approver, blocks[0]!.b.id, 'Court ruled for Zentrix');
    expect(await listBlocks(t.db, approver)).toHaveLength(0);
  });

  it('sign-up is rate limited per IP', async () => {
    const ip = '192.0.2.99';
    for (let i = 0; i < 5; i++) await expect(signUpSeller(deps(), { ...meta, ip }, { ...oem, gstin: 'bad' })).rejects.toBeTruthy();
    await expect(signUpSeller(deps(), { ...meta, ip }, { ...oem, gstin: 'bad' })).rejects.toThrow(/Too many sign-up attempts/);
  });

  it('unfinished sign-ups are removed after a week; confirmed ones stay', async () => {
    const r = await signUpSeller(deps(), { ...meta, ip: '192.0.2.50' }, { ...oem, legalName: 'Ghost Traders', gstin: gstin('27', 'AAGFG4321H'), email: 'ghost@traders.test' });
    expect(await purgeUnverifiedSignups(deps())).toBe(0); // too recent
    await t.db.execute(sql`update signup_codes set created_at = now() - interval '8 days' where email = 'ghost@traders.test'`);
    expect(await purgeUnverifiedSignups(deps())).toBe(1);
    const left = await t.db.execute(sql`select 1 from organisations where id = ${r.orgId} union all select 1 from profiles where email = 'ghost@traders.test' union all select 1 from auth.users where email = 'ghost@traders.test'`);
    expect(left).toHaveLength(0);
    expect((await getOrg(t.db, await ctxFor('admin@orbita.test'), oemOrg)).org.status).toBe('verified');
  });
});
