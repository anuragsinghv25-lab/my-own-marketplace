import { z } from 'zod';

/** "Display size (inch)" → "display_size_inch" */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'n_$1')
    .slice(0, 63);
}

const code = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{1,62}$/, 'Use lowercase letters, digits and _ (start with a letter)');

/** code is optional in forms: derived from the name when left empty */
const withCode = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object({ ...shape, code: z.string().trim().optional(), name: z.string().trim().min(1, 'Name is required').max(120) })
    .transform((v, c) => {
      const named = v as unknown as { code?: string; name: string };
      const raw = named.code && named.code.length ? named.code : slugify(named.name);
      const parsed = code.safeParse(raw);
      if (!parsed.success) {
        c.addIssue({ code: 'custom', path: ['code'], message: parsed.error.issues[0]!.message });
        return z.NEVER;
      }
      return { ...v, code: parsed.data } as typeof v & { code: string; name: string };
    });

const id = z.uuid().optional();
const status = z.enum(['active', 'deprecated']).default('active');

export const dimensionInput = withCode({ id, status });
export type DimensionInput = z.input<typeof dimensionInput>;

export const unitInput = withCode({
  id,
  status,
  dimensionId: z.uuid(),
  symbol: z.string().trim().min(1).max(12),
  factorToBase: z.coerce.number().positive('Must be greater than 0'),
  isBase: z.boolean().default(false),
});
export type UnitInput = z.input<typeof unitInput>;

export const valueListInput = withCode({
  id,
  status,
  description: z.string().trim().max(500).default(''),
  kind: z.enum(['plain', 'ordinal', 'group_ordinal']).default('plain'),
  items: z
    .array(
      z.object({
        id: z.uuid().optional(),
        value: z.string().trim().min(1, 'Value is required').max(200),
        weight: z.coerce.number().int().nullable().optional(),
        groupName: z.string().trim().max(100).nullable().optional(),
        status,
      }),
    )
    .max(2000),
});
export type ValueListInput = z.input<typeof valueListInput>;

export const booleanPairInput = z.object({
  id,
  status,
  code: z.string().trim().optional(),
  trueLabel: z.string().trim().min(1).max(40),
  falseLabel: z.string().trim().min(1).max(40),
});
export type BooleanPairInput = z.input<typeof booleanPairInput>;

export const ATTRIBUTE_TYPES = [
  'boolean',
  'enumerable',
  'multi_enumerable',
  'ordinal',
  'group_ordinal',
  'numeric',
  'numeric_range',
  'measurable',
  'measurable_range',
  'text',
  'key_value',
] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export const ATTRIBUTE_TYPE_LABELS: Record<AttributeType, string> = {
  boolean: 'Yes / no',
  enumerable: 'Pick one from a list',
  multi_enumerable: 'Pick several from a list',
  ordinal: 'Ranked list (higher is better)',
  group_ordinal: 'Ranked within groups',
  numeric: 'Number',
  numeric_range: 'Number range',
  measurable: 'Measurement with unit',
  measurable_range: 'Measurement range with unit',
  text: 'Free text',
  key_value: 'Key-value pairs',
};

export const LIST_TYPES: AttributeType[] = ['enumerable', 'multi_enumerable', 'ordinal', 'group_ordinal'];
export const NUMBER_TYPES: AttributeType[] = ['numeric', 'numeric_range', 'measurable', 'measurable_range'];
export const UNIT_TYPES: AttributeType[] = ['measurable', 'measurable_range'];

const optionalNumber = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().optional());

export const attributeInput = withCode({
  id,
  status,
  description: z.string().trim().max(1000).default(''),
  dataType: z.enum(ATTRIBUTE_TYPES),
  valueListId: z.uuid().nullable().optional(),
  booleanPairId: z.uuid().nullable().optional(),
  dimensionId: z.uuid().nullable().optional(),
  defaultUnitId: z.uuid().nullable().optional(),
  validation: z
    .object({
      min: optionalNumber,
      max: optionalNumber,
      step: optionalNumber,
      decimals: optionalNumber,
      maxLength: optionalNumber,
      regex: z.string().optional(),
    })
    .default({}),
  synonyms: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  buyerHint: z.string().trim().max(300).default(''),
  sellerHint: z.string().trim().max(300).default(''),
});
export type AttributeInput = z.input<typeof attributeInput>;

export const certificateTypeInput = withCode({
  id,
  status,
  issuer: z.string().trim().max(200).default(''),
  level: z.enum(['product', 'seller', 'both']).default('product'),
  fields: z.array(z.string().trim().min(1).max(40)).min(1).max(12).default(['number']),
  verification: z.enum(['manual', 'api']).default('manual'),
  hasExpiry: z.boolean().default(true),
  reminderDays: z.array(z.coerce.number().int().min(1).max(365)).max(6).default([30, 7]),
});
export type CertificateTypeInput = z.input<typeof certificateTypeInput>;

export const FLAG_VALUE_TYPES = ['boolean', 'number', 'text', 'single_select', 'multi_select', 'range'] as const;
export type FlagValueType = (typeof FLAG_VALUE_TYPES)[number];
export const FLAG_GROUPS = ['category', 'seller', 'buyer', 'marketplace', 'transactional'] as const;

export const flagDefinitionInput = z.object({
  id,
  status,
  key: z.string().trim().optional(),
  label: z.string().trim().min(1).max(120),
  groupName: z.enum(FLAG_GROUPS),
  ownerModule: z.string().trim().min(1).max(40).default('catalog'),
  valueType: z.enum(FLAG_VALUE_TYPES),
  schema: z
    .object({
      options: z.array(z.string().trim().min(1)).optional(),
      unit: z.string().trim().optional(),
      min: optionalNumber,
      max: optionalNumber,
    })
    .default({}),
  defaultValue: z.unknown().optional(),
  helpText: z.string().trim().max(500).default(''),
});
export type FlagDefinitionInput = z.input<typeof flagDefinitionInput>;

export const flagProfileInput = withCode({
  id,
  status,
  description: z.string().trim().max(500).default(''),
  /** flag key → value; flags left out are not part of the profile */
  values: z.record(z.string(), z.unknown()).default({}),
});
export type FlagProfileInput = z.input<typeof flagProfileInput>;
