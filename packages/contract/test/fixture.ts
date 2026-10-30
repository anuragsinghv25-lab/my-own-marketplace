import type { CompileInput, RuleInput, SpecInput } from '../src';

const opts = (...vs: string[]) => vs.map((value, i) => ({ value, weight: (i + 1) * 10 }));
const GB = { code: 'gb', symbol: 'GB', name: 'Gigabyte' };

export const specs: SpecInput[] = [
  { key: 'processor', label: 'Processor', attributeType: 'ordinal', group: 'Performance', importance: 'key', filterable: true, comparable: true, variantOption: false, preference: 'higher', options: opts('Intel Core i5', 'Intel Core i7', 'AMD Ryzen 7', 'AMD Ryzen 9') },
  { key: 'gpu', label: 'Graphics card', attributeType: 'enumerable', group: 'Performance', importance: 'required', filterable: true, comparable: true, variantOption: false, preference: 'none', options: opts('NVIDIA RTX 4060', 'NVIDIA RTX 4070', 'AMD Radeon RX 7600M', 'Intel Arc A370M') },
  { key: 'ram_gb', label: 'RAM', attributeType: 'measurable', group: 'Performance', importance: 'key', filterable: true, comparable: true, variantOption: true, preference: 'higher', unit: GB, attributeValidation: { min: 1, max: 512 }, min: 4, max: 128, step: 4 },
  { key: 'refresh_rate', label: 'Refresh rate', attributeType: 'measurable', group: 'Display', importance: 'recommended', filterable: true, comparable: true, variantOption: false, preference: 'higher', unit: { code: 'hz', symbol: 'Hz', name: 'Hertz' } },
  { key: 'rgb_keyboard', label: 'RGB keyboard', attributeType: 'boolean', group: 'Design', importance: 'optional', filterable: false, comparable: false, variantOption: false, preference: 'none', booleanLabels: { true: 'Yes', false: 'No' } },
  { key: 'color', label: 'Colour', attributeType: 'multi_enumerable', group: 'Design', importance: 'recommended', filterable: true, comparable: false, variantOption: false, preference: 'none', options: opts('Black', 'Grey', 'White', 'Red'), allowedValues: ['Black', 'Grey', 'White'] },
  { key: 'battery_hours', label: 'Battery life', attributeType: 'numeric', group: 'Design', importance: 'required', filterable: false, comparable: true, variantOption: false, preference: 'higher' },
  { key: 'dgpu_mux', label: 'MUX switch', attributeType: 'boolean', group: 'Performance', importance: 'optional', filterable: false, comparable: false, variantOption: false, preference: 'none' },
];

export const rules: RuleInput[] = [
  { id: 'r-amd-gpu', kind: 'restrict', name: 'AMD pairs with AMD or NVIDIA graphics', enabled: true, when: [{ key: 'processor', op: 'in', values: ['AMD Ryzen 7', 'AMD Ryzen 9'] }], target: 'gpu', values: ['NVIDIA RTX 4060', 'NVIDIA RTX 4070', 'AMD Radeon RX 7600M'] },
  { id: 'r-ram-min', kind: 'restrict', name: 'Gaming needs 8 GB', enabled: true, when: [], target: 'ram_gb', min: 8, message: 'Gaming laptops need at least 8 GB.' },
  { id: 'r-4070-refresh', kind: 'require', enabled: true, when: [{ key: 'gpu', op: 'in', values: ['NVIDIA RTX 4070'] }], target: 'refresh_rate' },
  { id: 'r-rgb-hides-battery', kind: 'hide', enabled: true, when: [{ key: 'rgb_keyboard', op: 'is_true' }], target: 'battery_hours' },
  { id: 'r-mux', kind: 'require', enabled: true, when: [{ key: 'gpu', op: 'in', values: ['NVIDIA RTX 4060', 'NVIDIA RTX 4070'] }, { key: 'ram_gb', op: 'gte', value: 16 }], target: 'dgpu_mux' },
  { id: 'r-price-r9', kind: 'price', enabled: true, when: [{ key: 'processor', op: 'in', values: ['AMD Ryzen 9'] }], priceMin: 80000, priceMax: 400000 },
];

export const input = (over: Partial<CompileInput> = {}): CompileInput => ({
  category: { id: 'c1', code: 'el-6-11-2', name: 'Gaming Laptops', path: ['Electronics', 'Computers', 'Gaming Computers', 'Gaming Laptops'] },
  version: { id: 'v1', number: 0 },
  flags: [
    { key: 'selling_units', label: 'Selling units', valueType: 'multi_select', value: ['piece'], source: 'default' },
    { key: 'price_label', label: 'Price label', valueType: 'single_select', value: 'offer_price_with_mrp', source: 'default' },
    { key: 'discount_band', label: 'Discount band', valueType: 'range', value: { min: 5, max: 40 }, source: 'profile' },
  ],
  specs,
  rules,
  titleTemplate: '{brand} {model} {processor} {ram_gb} ({gpu})',
  ...over,
});
