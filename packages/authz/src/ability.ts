import {
  AbilityBuilder,
  createMongoAbility,
  type ForcedSubject,
  subject as caslSubject,
  type MongoAbility,
  type MongoQuery,
} from '@casl/ability';
import type { Area, RoleKey, ScopeType } from './roles';

/**
 * Layer 1 (role) and layer 2 (scope) of the authorisation model become CASL rules here.
 * Layer 3 (conditions on object state, separation of duties) is expressed as
 * conditions on the same rules, so one `ability.can(action, subject(type, object))`
 * call answers all three.
 */
export type Action =
  | 'manage'
  | 'access'
  | 'read'
  | 'create'
  | 'update'
  | 'submit'
  | 'approve'
  | 'assign'
  | 'invite'
  | 'grant'
  | 'revoke'
  | 'deactivate';

export type SubjectType =
  | 'all'
  | Area
  | 'DesignGallery'
  | 'User'
  | 'RoleGrant'
  | 'AuditEvent'
  | 'AttributeLibrary'
  | 'StandardTaxonomy'
  | 'FlagProfile'
  | 'Workgroup'
  | 'CategoryNode'
  | 'CategoryVersion'
  | 'VendorAssessment'
  | 'BrandRequest'
  | 'Catalog'
  | 'Offer'
  | 'SellerOrg'
  | 'Escalation';

/** A plain object tagged with its subject type, so conditions can be checked against it. */
export type TaggedSubject = Record<string, unknown> & ForcedSubject<Exclude<SubjectType, 'all'>>;

export type AppAbility = MongoAbility<[Action, SubjectType | TaggedSubject]>;

export interface Grant {
  role: RoleKey;
  scopeType: ScopeType;
  scopeId: string | null;
}

export interface AbilityInput {
  userId: string;
  grants: readonly Grant[];
}

/** Tag a plain object with its subject type so CASL can apply conditions. */
export function subject(type: Exclude<SubjectType, 'all'>, obj: Record<string, unknown>): TaggedSubject {
  return caslSubject(type, obj) as TaggedSubject;
}

const SCOPE_FIELD: Record<Exclude<ScopeType, 'global'>, string> = {
  workgroup: 'workgroupId',
  org: 'orgId',
  brand: 'brandId',
};

export function defineAbilityFor({ userId, grants }: AbilityInput): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  // Subjects are plain strings, which CASL types with `never` conditions; rules here are
  // checked by tests instead, so use a loose signature.
  type Rule = (
    action: Action | Action[],
    subject: SubjectType | SubjectType[],
    conditions?: Record<string, unknown>,
  ) => unknown;
  const can = builder.can as unknown as Rule;
  const cannot = builder.cannot as unknown as Rule;

  // Everyone signed in can see their own profile and the design gallery.
  can('read', 'User', { id: userId });
  can('read', 'DesignGallery');

  for (const g of grants) {
    /** Merge the grant's scope into a condition object (no-op for global grants). */
    const scoped = (cond: MongoQuery = {}): MongoQuery =>
      g.scopeType === 'global' || !g.scopeId
        ? cond
        : { ...cond, [SCOPE_FIELD[g.scopeType]]: g.scopeId };
    const hasConds = (c: MongoQuery) => Object.keys(c).length > 0;
    const allow = (
      action: Action | Action[],
      type: SubjectType | SubjectType[],
      cond: MongoQuery = {},
    ) => {
      const c = scoped(cond);
      if (hasConds(c)) can(action, type, c);
      else can(action, type);
    };

    const READ_CONFIG: SubjectType[] = ['AttributeLibrary', 'StandardTaxonomy', 'FlagProfile', 'Workgroup', 'CategoryNode', 'CategoryVersion'];

    switch (g.role) {
      case 'platform_admin':
        can('access', 'AdminConsole');
        can(['read', 'invite', 'update', 'deactivate'], 'User');
        can(['read', 'grant', 'revoke'], 'RoleGrant');
        can('read', 'AuditEvent');
        can(['read', 'create', 'update'], ['AttributeLibrary', 'StandardTaxonomy', 'FlagProfile', 'Workgroup']);
        can('read', ['CategoryNode', 'CategoryVersion']);
        break;

      case 'category_manager':
        can('access', 'Workbench');
        can('read', READ_CONFIG);
        allow(['create', 'update'], 'CategoryNode');
        allow(['update', 'submit', 'assign'], 'CategoryVersion', { state: 'DRAFT' });
        allow('update', 'CategoryVersion', { state: 'IN_REVIEW' }); // withdraw from review
        break;

      case 'approver':
        can('access', ['Workbench', 'ReviewDesk']);
        can('read', READ_CONFIG);
        allow('approve', 'CategoryVersion', { state: 'IN_REVIEW' });
        can(['read', 'approve', 'assign'], ['VendorAssessment', 'BrandRequest', 'Catalog', 'Escalation']);
        can('read', 'Offer');
        break;

      case 'reviewer':
        can('access', 'ReviewDesk');
        can(['read', 'approve'], ['VendorAssessment', 'BrandRequest', 'Catalog']);
        can(['read', 'create'], 'Escalation'); // escalate to an approver
        can('read', ['Offer', 'CategoryNode', 'CategoryVersion']);
        break;

      case 'auditor':
        can('access', 'AdminConsole');
        can('read', 'all');
        break;

      case 'seller_admin':
        can('access', 'SellerApp');
        allow(['read', 'update'], 'SellerOrg');
        allow(['read', 'create', 'update', 'submit'], ['BrandRequest', 'Catalog', 'Offer']);
        can('read', ['CategoryNode', 'CategoryVersion']);
        break;

      case 'seller_staff':
        can('access', 'SellerApp');
        allow('read', 'SellerOrg');
        allow(['read', 'create', 'update', 'submit'], ['BrandRequest', 'Catalog', 'Offer']);
        can('read', ['CategoryNode', 'CategoryVersion']);
        break;

      case 'brand_owner':
        can('access', 'SellerApp');
        allow(['read', 'update', 'approve'], 'Catalog');
        break;
    }
  }

  // Separation of duties (layer 3): nobody approves what they submitted or edited.
  // (Two rules, not one $or: CASL's default matcher does not support $or.)
  const reviewed: SubjectType[] = ['CategoryVersion', 'BrandRequest', 'Catalog', 'VendorAssessment'];
  cannot('approve', reviewed, { submittedBy: userId });
  cannot('approve', reviewed, { editorIds: { $all: [userId] } });

  // Auditors never write, whatever else is configured.
  if (grants.some((g) => g.role === 'auditor')) {
    cannot(
      ['create', 'update', 'submit', 'approve', 'assign', 'invite', 'grant', 'revoke', 'deactivate'],
      'all',
    );
  }

  return builder.build();
}

/** The areas (apps) a user can open, in display order. */
export function accessibleAreas(ability: AppAbility): Area[] {
  return (['AdminConsole', 'Workbench', 'ReviewDesk', 'SellerApp'] as const).filter((a) =>
    ability.can('access', a),
  );
}
