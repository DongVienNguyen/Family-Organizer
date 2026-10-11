import fs from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
const load = async () => import('./systemMetrics.js').catch(() => ({} as any));
describe('Windows-native metrics', () => {
  it('uses selected data volume and reports unsupported temperatures/load explicitly', async () => {
    const { createSystemMetrics } = await load(); expect(createSystemMetrics).toBeTypeOf('function');
    const metrics = createSystemMetrics(process.env.DATA_DIR!); await fs.mkdir(process.env.DATA_DIR!, { recursive: true });
    const value = await metrics.sample();
    expect(value.tempC).toBeNull(); expect(value.ssdTempC).toBeNull();
    expect(value.capabilities.temperature).toBe('unsupported'); expect(value.loadAvg).toBeNull();
    expect(value.memory.totalBytes).toBeGreaterThan(0); expect(value.process.rssBytes).toBeGreaterThan(0);
    expect(value.disk.totalBytes).toBeGreaterThan(0); expect(value.disk.root).toBe(process.env.DATA_DIR);
    expect(value.cpu.percent === null || (value.cpu.percent >= 0 && value.cpu.percent <= 100)).toBe(true);
  });
  it('returns unavailable disk instead of fabricated zero on missing storage', async () => {
    const { createSystemMetrics } = await load(); expect(createSystemMetrics).toBeTypeOf('function');
    const value = await createSystemMetrics(process.env.DATA_DIR! + '/missing-volume').sample();
    expect(value.disk).toBeNull();
  });
});
