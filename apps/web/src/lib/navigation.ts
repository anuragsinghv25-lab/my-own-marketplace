import { AREAS, type Action, type AppAbility, type Area, type SubjectType } from '@orbita/authz';

/**
 * Sidebar items per area. An item shows only when the user's ability allows `requires`.
 * Items with `release` are previews of later releases: visible (so people see what is coming
 * for their role) but not clickable yet.
 */
export type IconName =
  | 'home'
  | 'users'
  | 'shield'
  | 'scroll'
  | 'library'
  | 'globe'
  | 'flag'
  | 'network'
  | 'tree'
  | 'layers'
  | 'stamp'
  | 'badge'
  | 'building'
  | 'package'
  | 'tag'
  | 'alert'
  | 'palette'
  | 'activity'
  | 'factory'
  | 'certificate';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  requires: [Action, SubjectType];
  release?: string;
}

export interface NavSection {
  area: Area;
  label: string;
  items: NavItem[];
}

const NAV: Record<Area, NavItem[]> = {
  AdminConsole: [
    { href: '/admin', label: 'Overview', icon: 'home', requires: ['access', 'AdminConsole'] },
    { href: '/admin/users', label: 'Users', icon: 'users', requires: ['read', 'RoleGrant'] },
    { href: '/admin/roles', label: 'Roles', icon: 'shield', requires: ['read', 'RoleGrant'] },
    { href: '/admin/audit', label: 'Audit log', icon: 'scroll', requires: ['read', 'AuditEvent'] },
    { href: '/admin/library', label: 'Attribute library', icon: 'library', requires: ['read', 'AttributeLibrary'] },
    { href: '/admin/standards', label: 'Standard taxonomies', icon: 'globe', requires: ['create', 'StandardTaxonomy'] },
    { href: '/admin/flags', label: 'Flags & profiles', icon: 'flag', requires: ['read', 'FlagProfile'] },
    { href: '/admin/workgroups', label: 'Workgroups', icon: 'network', requires: ['read', 'Workgroup'] },
    { href: '/admin/reviews', label: 'Review rules', icon: 'stamp', requires: ['update', 'ReviewDefinition'] },
    { href: '/admin/brand-names', label: 'Brand names', icon: 'badge', requires: ['create', 'ProhibitedName'] },
  ],
  Workbench: [
    { href: '/workbench', label: 'Home', icon: 'home', requires: ['access', 'Workbench'] },
    { href: '/workbench/taxonomy', label: 'Category tree', icon: 'tree', requires: ['read', 'CategoryNode'] },
    { href: '/workbench/versions', label: 'Category versions', icon: 'layers', requires: ['read', 'CategoryVersion'] },
    { href: '/workbench/status', label: 'Category status', icon: 'activity', requires: ['read', 'CategoryVersion'] },
  ],
  ReviewDesk: [
    { href: '/reviews', label: 'Category approvals', icon: 'stamp', requires: ['read', 'ReviewRequest'] },
    { href: '/reviews/sellers', label: 'Seller verification', icon: 'building', requires: ['approve', 'SellerOrg'] },
    { href: '/reviews/vendors', label: 'Vendor assessments', icon: 'factory', requires: ['approve', 'VendorAssessment'] },
    { href: '/reviews/brands', label: 'Brand requests', icon: 'badge', requires: ['approve', 'BrandRequest'] },
    { href: '/reviews/certificates', label: 'Certificates', icon: 'certificate', requires: ['approve', 'Certificate'] },
    { href: '/reviews/catalogs', label: 'Catalog reviews', icon: 'package', requires: ['approve', 'Catalog'], release: 'R5' },
    { href: '/reviews/escalations', label: 'Escalations', icon: 'alert', requires: ['approve', 'Escalation'] },
  ],
  SellerApp: [
    { href: '/seller', label: 'Home', icon: 'home', requires: ['access', 'SellerApp'] },
    { href: '/seller/organisation', label: 'Organisation', icon: 'building', requires: ['read', 'SellerOrg'] },
    { href: '/seller/vendor-assessment', label: 'Vendor assessment', icon: 'factory', requires: ['read', 'VendorAssessment'] },
    { href: '/seller/brands', label: 'Brands', icon: 'badge', requires: ['read', 'BrandRequest'] },
    { href: '/seller/oem', label: 'Your brands (OEM)', icon: 'shield', requires: ['approve', 'Brand'] },
    { href: '/seller/certificates', label: 'Certificates', icon: 'certificate', requires: ['read', 'Certificate'] },
    { href: '/seller/catalogs', label: 'Catalogs', icon: 'package', requires: ['read', 'Catalog'], release: 'R5' },
    { href: '/seller/offers', label: 'Offers', icon: 'tag', requires: ['read', 'Offer'], release: 'R5' },
  ],
};

/** Sections for the areas this user can access, each filtered to the items they may use. */
export function navigationFor(ability: AppAbility): NavSection[] {
  return (Object.keys(NAV) as Area[])
    .filter((area) => ability.can('access', area))
    .map((area) => ({
      area,
      label: AREAS[area].label,
      items: NAV[area].filter((i) => ability.can(i.requires[0], i.requires[1])),
    }));
}

export const ALL_NAV = NAV;
