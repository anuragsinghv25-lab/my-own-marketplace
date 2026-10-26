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

    switch (g.role) {
      case 'platform_admin':
        can('access', 'AdminConsole');
        can(['read', 'invite', 'update', 'deactivate'], 'User');
        can(['read', 'grant', 'revoke'], 'RoleGrant');
        can('read', 'AuditEvent');
        break;

      case 'template_manager':
        can('access', 'AdminConsole');
        can(['read', 'create', 'update'], ['AttributeLibrary', 'FlagProfile']);
        can('read', ['Workgroup', 'CategoryNode', 'CategoryVersion']);
        break;

      case 'workgroup_manager':
        can('access', 'AdminConsole');
        can(['read', 'create', 'update'], 'Workgroup');
        can('read', ['AttributeLibrary', 'FlagProfile', 'CategoryNode', 'User']);
        break;

      case 'category_creator':
        can('access', 'Workbench');
        can('read', ['AttributeLibrary', 'FlagProfile', 'Workgroup', 'CategoryNode', 'CategoryVersion']);
        allow(['create', 'update'], 'CategoryNode');
        break;

      case 'category_drafter':
      case 'category_checker':
        can('access', 'Workbench');
        can('read', ['AttributeLibrary', 'FlagProfile', 'Workgroup', 'CategoryNode', 'CategoryVersion']);
        allow('update', 'CategoryVersion', { state: 'DRAFT' });
        if (g.role === 'category_checker') {
          allow('submit', 'CategoryVersion', { state: 'DRAFT' });
          allow('update', 'CategoryVersion', { state: 'IN_REVIEW' }); // send back
          allow('assign', 'CategoryVersion', { state: 'DRAFT' });
        }
        break;

      case 'category_approver':
        can('access', 'Workbench');
        can('read', ['AttributeLibrary', 'FlagProfile', 'Workgroup', 'CategoryNode', 'CategoryVersion']);
        allow('approve', 'CategoryVersion', { state: 'IN_REVIEW' });
        break;

      case 'va_officer':
        can('access', 'ReviewDesk');
        can(['read', 'approve'], 'VendorAssessment');
        break;

      case 'brand_specialist':
      case 'agency_manager':
        can('access', 'ReviewDesk');
        can(['read', 'approve'], 'BrandRequest');
        if (g.role === 'agency_manager') can('assign', 'BrandRequest');
        break;

      case 'product_reviewer':
        can('access', 'ReviewDesk');
        can(['read', 'approve'], 'Catalog');
        can('read', ['Offer', 'BrandRequest']);
        break;

      case 'marketplace_manager':
        can('access', 'ReviewDesk');
        can(['read', 'approve', 'assign'], 'Escalation');
        can('read', ['BrandRequest', 'Catalog', 'VendorAssessment']);
        break;

      case 'committee_member':
        can('access', 'ReviewDesk');
        can(['read', 'approve'], 'Escalation');
        break;

      case 'auditor':
        can('access', 'AdminConsole');
        can('read', 'all');
        break;

      case 'seller_admin':
        can('access', 'SellerApp');
        allow(['read', 'update'], 'SellerOrg');
        allow('read', ['Catalog', 'Offer', 'BrandRequest']);
        break;

      case 'seller_lister':
        can('access', 'SellerApp');
        allow(['read', 'create', 'update', 'submit'], ['Catalog', 'Offer', 'BrandRequest']);
        break;

      case 'seller_pricing':
        can('access', 'SellerApp');
        allow('read', 'Catalog');
        allow(['read', 'update'], 'Offer');
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
