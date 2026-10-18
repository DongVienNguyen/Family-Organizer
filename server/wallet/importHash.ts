import { createHash } from 'node:crypto';
function canonical(v: unknown): unknown { return Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)])) : v; }
export const importHash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
