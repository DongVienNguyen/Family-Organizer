import os from 'node:os';
import fs from 'node:fs/promises';

function cpuTimes() {
  let idle = 0, total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += Object.values(cpu.times).reduce((sum, n) => sum + n, 0);
  }
  return { idle, total };
}

export function createSystemMetrics(dataRoot: string) {
  let previous = cpuTimes();
  return {
    async sample() {
      const current = cpuTimes();
      const delta = current.total - previous.total;
      const percent = delta > 0 ? Math.max(0, Math.min(100, (1 - (current.idle - previous.idle) / delta) * 100)) : null;
      previous = current;
      const totalBytes = os.totalmem(), availableBytes = os.freemem();
      let disk: { root: string; totalBytes: number; freeBytes: number; usedBytes: number } | null = null;
      try {
        const stat = await fs.statfs(dataRoot);
        const total = Number(stat.blocks) * Number(stat.bsize), free = Number(stat.bavail) * Number(stat.bsize);
        if (Number.isFinite(total) && Number.isFinite(free) && total > 0) disk = { root: dataRoot, totalBytes: total, freeBytes: free, usedBytes: total - free };
      } catch { /* Unavailable volume is explicit null, never a fabricated zero. */ }
      const cpus = os.cpus();
      return {
        cpu: { percent, cores: cpus.length, model: cpus[0]?.model || '' },
        memory: { totalBytes, availableBytes, usedBytes: Math.max(0, totalBytes - availableBytes) },
        disk, tempC: null, ssdTempC: null, loadAvg: null,
        capabilities: { temperature: 'unsupported' as const, loadAverage: 'unsupported' as const },
        process: { uptimeSec: Math.round(process.uptime()), rssBytes: process.memoryUsage.rss() },
      };
    },
  };
}
