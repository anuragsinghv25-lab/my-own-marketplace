import { describe, expect, it } from 'vitest';
import {
  ROLE_KEYS,
  ROLES,
  accessibleAreas,
  defineAbilityFor,
  grantProblem,
  homeAreaFor,
  subject,
  type Grant,
  type RoleKey,
} from '../src';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const WG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const g = (role: RoleKey, scopeType: Grant['scopeType'] = 'global', scopeId: string | null = null): Grant => ({
  role,
  scopeType,
  scopeId,
});
const abilityOf = (...grants: Grant[]) => defineAbilityFor({ userId: ME, grants });

describe('areas: each role sees only its own area(s)', () => {
  const expected: Record<RoleKey, string[]> = {
    platform_admin: ['AdminConsole'],
    category_manager: ['Workbench'],
    approver: ['Workbench', 'ReviewDesk'],
    reviewer: ['ReviewDesk'],
    auditor: ['AdminConsole'],
    seller_admin: ['SellerApp'],
    seller_staff: ['SellerApp'],
    brand_owner: ['SellerApp'],
  };
  for (const role of ROLE_KEYS) {
    it(role, () => {
      const scope = ROLES[role].scopes[0]!;
      const grant = g(role, scope, scope === 'global' ? null : WG_A);
      expect(accessibleAreas(abilityOf(grant))).toEqual(expected[role]);
      expect(expected[role]).toContain(ROLES[role].home);
    });
  }

  it('a user with no grants sees no area', () => {
    expect(accessibleAreas(abilityOf())).toEqual([]);
  });
});

describe('user administration (sample resource for R0)', () => {
  for (const role of ROLE_KEYS) {
    const scope = ROLES[role].scopes[0]!;
    const ability = abilityOf(g(role, scope, scope === 'global' ? null : WG_A));
    const shouldAllow = role === 'platform_admin';
    it(`${role} ${shouldAllow ? 'can' : 'cannot'} invite users and grant roles`, () => {
      expect(ability.can('invite', 'User')).toBe(shouldAllow);
      expect(ability.can('grant', 'RoleGrant')).toBe(shouldAllow);
      expect(ability.can('revoke', 'RoleGrant')).toBe(shouldAllow);
    });
  }

  it('everyone can read their own profile but not others', () => {
    const a = abilityOf(g('seller_staff', 'org', WG_A));
    expect(a.can('read', subject('User', { id: ME }))).toBe(true);
    expect(a.can('read', subject('User', { id: OTHER }))).toBe(false);
  });

  it('platform admin and auditor can read the audit log; others cannot', () => {
    expect(abilityOf(g('platform_admin')).can('read', 'AuditEvent')).toBe(true);
    expect(abilityOf(g('auditor')).can('read', 'AuditEvent')).toBe(true);
    expect(abilityOf(g('category_manager')).can('read', 'AuditEvent')).toBe(false);
    expect(abilityOf(g('seller_admin', 'org', WG_A)).can('read', 'AuditEvent')).toBe(false);
  });

  it('platform admin owns shared configuration', () => {
    const a = abilityOf(g('platform_admin'));
    expect(a.can('update', 'AttributeLibrary')).toBe(true);
    expect(a.can('create', 'Workgroup')).toBe(true);
    expect(a.can('update', 'FlagProfile')).toBe(true);
    expect(abilityOf(g('category_manager')).can('update', 'AttributeLibrary')).toBe(false);
  });

  it('platform admin loads standard taxonomies; category managers only browse and adopt from them', () => {
    expect(abilityOf(g('platform_admin')).can('create', 'StandardTaxonomy')).toBe(true);
    const cm = abilityOf(g('category_manager', 'workgroup', WG_A));
    expect(cm.can('read', 'StandardTaxonomy')).toBe(true);
    expect(cm.can('create', 'StandardTaxonomy')).toBe(false);
    expect(abilityOf(g('seller_admin', 'org', WG_A)).can('read', 'StandardTaxonomy')).toBe(false);
  });

  it('auditor never writes', () => {
    const a = abilityOf(g('auditor'));
    expect(a.can('read', 'User')).toBe(true);
    expect(a.can('invite', 'User')).toBe(false);
    expect(a.can('update', 'CategoryVersion')).toBe(false);
    expect(a.can('approve', 'BrandRequest')).toBe(false);
  });

  it('platform admin cannot approve business requests', () => {
    const a = abilityOf(g('platform_admin'));
    expect(a.can('approve', 'CategoryVersion')).toBe(false);
    expect(a.can('approve', 'BrandRequest')).toBe(false);
    expect(a.can('approve', 'Catalog')).toBe(false);
  });
});

describe('flows: every step has a role that can do it', () => {
  const cm = abilityOf(g('category_manager', 'workgroup', WG_A));
  const ap = abilityOf(g('approver'));
  const rv = abilityOf(g('reviewer'));
  const sa = abilityOf(g('seller_admin', 'org', WG_A));
  const bo = abilityOf(g('brand_owner', 'brand', WG_B));
  const draft = { workgroupId: WG_A, state: 'DRAFT', editorIds: [ME] };

  it('category: manager creates, drafts and submits; approver approves', () => {
    expect(cm.can('create', subject('CategoryNode', { workgroupId: WG_A }))).toBe(true);
    expect(cm.can('update', subject('CategoryVersion', draft))).toBe(true);
    expect(cm.can('submit', subject('CategoryVersion', draft))).toBe(true);
    expect(cm.can('approve', 'CategoryVersion')).toBe(false);
    expect(ap.can('approve', subject('CategoryVersion', { state: 'IN_REVIEW', submittedBy: OTHER, editorIds: [OTHER] }))).toBe(true);
  });

  it('brand: seller requests; reviewer decides or escalates; approver decides escalations', () => {
    expect(sa.can('create', subject('BrandRequest', { orgId: WG_A }))).toBe(true);
    expect(rv.can('approve', subject('BrandRequest', { submittedBy: OTHER }))).toBe(true);
    expect(rv.can('create', 'Escalation')).toBe(true);
    expect(rv.can('approve', 'Escalation')).toBe(false);
    expect(ap.can('approve', 'Escalation')).toBe(true);
    expect(ap.can('assign', 'BrandRequest')).toBe(true);
  });

  it('catalog: seller lists; brand owner approves resellers of own brand; reviewer approves', () => {
    expect(sa.can('submit', subject('Catalog', { orgId: WG_A }))).toBe(true);
    expect(sa.can('update', subject('Offer', { orgId: WG_A }))).toBe(true);
    expect(bo.can('approve', subject('Catalog', { brandId: WG_B, submittedBy: OTHER }))).toBe(true);
    expect(bo.can('approve', subject('Catalog', { brandId: WG_A, submittedBy: OTHER }))).toBe(false);
    expect(rv.can('approve', subject('Catalog', { submittedBy: OTHER }))).toBe(true);
  });

  it('vendor assessment: reviewer decides, approver handles escalations', () => {
    expect(rv.can('approve', 'VendorAssessment')).toBe(true);
    expect(ap.can('approve', 'VendorAssessment')).toBe(true);
  });
});

describe('scope and conditions', () => {
  it('workgroup-scoped manager edits only drafts in their workgroup', () => {
    const a = abilityOf(g('category_manager', 'workgroup', WG_A));
    expect(a.can('update', subject('CategoryVersion', { workgroupId: WG_A, state: 'DRAFT' }))).toBe(true);
    expect(a.can('update', subject('CategoryVersion', { workgroupId: WG_B, state: 'DRAFT' }))).toBe(false);
    expect(a.can('update', subject('CategoryVersion', { workgroupId: WG_A, state: 'PUBLISHED' }))).toBe(false);
    expect(a.can('submit', subject('CategoryVersion', { workgroupId: WG_B, state: 'DRAFT' }))).toBe(false);
  });

  it('approver cannot approve a version they edited or submitted (maker ≠ approver)', () => {
    const a = abilityOf(g('approver', 'workgroup', WG_A));
    const base = { workgroupId: WG_A, state: 'IN_REVIEW', submittedBy: OTHER, editorIds: [OTHER] };
    expect(a.can('approve', subject('CategoryVersion', base))).toBe(true);
    expect(a.can('approve', subject('CategoryVersion', { ...base, workgroupId: WG_B }))).toBe(false);
    expect(a.can('approve', subject('CategoryVersion', { ...base, editorIds: [OTHER, ME] }))).toBe(false);
    expect(a.can('approve', subject('CategoryVersion', { ...base, submittedBy: ME }))).toBe(false);
  });

  it('seller roles are limited to their organisation; staff cannot change the organisation', () => {
    const a = abilityOf(g('seller_admin', 'org', WG_A));
    expect(a.can('update', subject('Catalog', { orgId: WG_A }))).toBe(true);
    expect(a.can('update', subject('Catalog', { orgId: WG_B }))).toBe(false);
    expect(a.can('update', subject('SellerOrg', { orgId: WG_A }))).toBe(true);
    const s = abilityOf(g('seller_staff', 'org', WG_A));
    expect(s.can('update', subject('Offer', { orgId: WG_A }))).toBe(true);
    expect(s.can('update', subject('SellerOrg', { orgId: WG_A }))).toBe(false);
  });

  it('reviewer cannot approve a request they submitted', () => {
    const a = abilityOf(g('reviewer'));
    expect(a.can('approve', subject('BrandRequest', { submittedBy: OTHER }))).toBe(true);
    expect(a.can('approve', subject('BrandRequest', { submittedBy: ME }))).toBe(false);
  });
});

describe('grant validation', () => {
  it('rejects derived roles', () => {
    expect(grantProblem('brand_owner', 'brand', WG_A, [])).toMatch(/automatically/);
  });
  it('rejects wrong scope', () => {
    expect(grantProblem('platform_admin', 'workgroup', WG_A, [])).toMatch(/cannot be granted/);
    expect(grantProblem('seller_admin', 'org', null, [])).toMatch(/required/);
  });
  it('rejects duplicates', () => {
    expect(grantProblem('category_manager', 'global', null, [g('category_manager')])).toMatch(/already/);
  });
  it('enforces separation of duties', () => {
    expect(grantProblem('approver', 'global', null, [g('platform_admin')])).toMatch(/separation/);
    expect(grantProblem('reviewer', 'global', null, [g('approver')])).toMatch(/separation/);
    expect(grantProblem('auditor', 'global', null, [g('category_manager')])).toMatch(/separation/);
    expect(grantProblem('category_manager', 'global', null, [g('auditor')])).toMatch(/separation/);
  });
  it('allows valid combinations', () => {
    expect(grantProblem('approver', 'global', null, [g('category_manager')])).toBeNull();
    expect(grantProblem('category_manager', 'global', null, [g('platform_admin')])).toBeNull();
  });
});

describe('home area', () => {
  it('uses the first role in catalogue order', () => {
    expect(homeAreaFor(['seller_staff', 'category_manager'])).toBe('Workbench');
    expect(homeAreaFor(['approver'])).toBe('ReviewDesk');
    expect(homeAreaFor([])).toBeNull();
  });
});
