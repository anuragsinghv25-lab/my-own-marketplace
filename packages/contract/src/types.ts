/**
 * The Category Contract: everything a listing category's published version requires,
 * compiled once and read by every consumer (seller form, API, bulk upload, AI, review, search).
 * Pure data; no framework, no database.
 */

/** Library data types (mirrors the attribute library). */
export type AttributeType =
  | 'boolean'
  | 'enumerable'
  | 'multi_enumerable'
  | 'ordinal'
  | 'group_ordinal'
  | 'numeric'
  | 'numeric_range'
  | 'measurable'
  | 'measurable_range'
  | 'text'
  | 'key_value';

/** How a field is entered. */
export type FieldKind = 'boolean' | 'select' | 'multiselect' | 'number' | 'range' | 'text' | 'keyvalue';

/** Key specs identify the product (title, cards, duplicate detection); required and recommended need no explanation. */
export type Importance = 'key' | 'required' | 'recommended' | 'optional';
export const IMPORTANCE_ORDER: Importance[] = ['key', 'required', 'recommended', 'optional'];

/** For comparisons: is a larger value better, a smaller one, or neither? */
export type Preference = 'none' | 'higher' | 'lower';

export interface Option {
  value: string;
  weight?: number | null;
  group?: string | null;
}

export interface Unit {
  code: string;
  symbol: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Compiler input: a category version's configuration, resolved by the caller.

export interface SpecInput {
  /** attribute code; becomes the field key */
  key: string;
  label: string;
  attributeType: AttributeType;
  group: string;
  importance: Importance;
  filterable: boolean;
  comparable: boolean;
  variantOption: boolean;
  preference: Preference;
  /** list types: force single (false) or several (true) values; null = the attribute's own type decides */
  multiple?: boolean | null;
  /** the value list's active items, in order */
  options?: Option[];
  /** the category narrows the list to these values; null = all */
  allowedValues?: string[] | null;
  booleanLabels?: { true: string; false: string } | null;
  unit?: Unit | null;
  /** bounds set on the attribute in the library; the category may narrow them, never widen */
  attributeValidation?: { min?: number; max?: number; step?: number; decimals?: number; maxLength?: number; regex?: string };
  min?: number | null;
  max?: number | null;
  step?: number | null;
  decimals?: number | null;
  sellerHint?: string;
  buyerHint?: string;
}

export type ConditionOp = 'in' | 'not_in' | 'gte' | 'lte' | 'between' | 'is_true' | 'is_false' | 'filled';

export interface Condition {
  key: string;
  op: ConditionOp;
  values?: string[];
  value?: number;
  value2?: number;
}

export type RuleKind = 'restrict' | 'require' | 'hide' | 'price';

export interface RuleInput {
  id: string;
  kind: RuleKind;
  name?: string;
  enabled: boolean;
  /** all must hold (AND); empty = always */
  when: Condition[];
  /** restrict / require / hide */
  target?: string;
  /** restrict on a list field: allowed values */
  values?: string[];
  /** restrict on a number field: bounds */
  min?: number | null;
  max?: number | null;
  /** price: offer price bounds per selling unit, in rupees */
  priceMin?: number | null;
  priceMax?: number | null;
  /** shown to the seller when the rule blocks them */
  message?: string;
}

export interface FlagInput {
  key: string;
  label: string;
  valueType: 'boolean' | 'number' | 'text' | 'single_select' | 'multi_select' | 'range';
  value: unknown;
  source: 'default' | 'profile' | 'version' | 'none';
}

export interface CompileInput {
  category: { id: string; code: string; name: string; path: string[] };
  version: { id: string; number: number };
  flags: FlagInput[];
  specs: SpecInput[];
  rules: RuleInput[];
  titleTemplate: string;
  /** platform cap on title length */
  titleMaxLength?: number;
}

// ---------------------------------------------------------------------------
// Compiler output

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  attributeType: AttributeType;
  group: string;
  order: number;
  required: boolean;
  importance: Importance;
  filterable: boolean;
  comparable: boolean;
  variantOption: boolean;
  preference: Preference;
  options?: Option[];
  booleanLabels?: { true: string; false: string };
  unit?: Unit;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  maxLength?: number;
  pattern?: string;
  sellerHint?: string;
  buyerHint?: string;
}

export interface ContractRule {
  id: string;
  kind: RuleKind;
  name?: string;
  when: Condition[];
  target?: string;
  values?: string[];
  min?: number;
  max?: number;
  priceMin?: number;
  priceMax?: number;
  message?: string;
  /** plain-language sentence, for sellers and reviewers */
  text: string;
}

export interface FilterDef {
  key: string;
  label: string;
  kind: 'options' | 'range' | 'boolean';
  options?: string[];
  unit?: string;
  buckets?: { min: number; max: number; label: string }[];
}

export interface OfferTerms {
  sellingUnits: string[];
  priceLabel: string | null;
  /** allowed discount off MRP, percent */
  discountBand: { min: number; max: number } | null;
  maxImages: number | null;
  videoAllowed: boolean;
  countryOfOriginRequired: boolean;
  certificatesRequired: boolean;
  allowedSellers: string | null;
}

export interface Contract {
  schemaVersion: 1;
  category: CompileInput['category'];
  version: CompileInput['version'];
  fields: FieldDef[];
  groups: string[];
  rules: ContractRule[];
  titleTemplate: string;
  titleMaxLength: number;
  filters: FilterDef[];
  variantOptions: string[];
  offer: OfferTerms;
  flags: Record<string, unknown>;
  /** JSON Schema (draft-07) for product facts, for API consumers and other languages */
  productSchema: Record<string, unknown>;
  /** JSON Schema (draft-07) for offer price */
  offerSchema: Record<string, unknown>;
}

export interface Issue {
  severity: 'error' | 'warning';
  section: 'specs' | 'rules' | 'flags' | 'title' | 'general';
  /** the spec key, rule id or flag key the issue is about */
  ref?: string;
  message: string;
}

export interface CompileResult {
  ok: boolean;
  contract: Contract | null;
  issues: Issue[];
}

// ---------------------------------------------------------------------------
// Evaluation (the same code runs in the seller's browser, the server and the test cases)

export interface Sample {
  values: Record<string, unknown>;
  brand?: string;
  model?: string;
  /** offer price per selling unit, rupees */
  price?: number | null;
  mrp?: number | null;
}

export interface FieldState {
  visible: boolean;
  required: boolean;
  options?: Option[];
  min?: number;
  max?: number;
  /** ids of the rules that changed this field */
  by: string[];
}

export interface EvalProblem {
  key: string | null;
  message: string;
  ruleId?: string;
}

export interface Evaluation {
  fields: Record<string, FieldState>;
  errors: EvalProblem[];
  /** values given for fields that are hidden by a rule; they will be dropped */
  ignored: string[];
  activeRules: string[];
  priceBand: { min: number | null; max: number | null; reasons: string[] } | null;
  title: string;
  /** 0–100, weighted by importance */
  quality: number;
}
