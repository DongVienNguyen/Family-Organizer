/** @license SPDX-License-Identifier: Apache-2.0 */
// Readonly build identity. Windows releases are applied by the operator.
import fs from 'node:fs';
import path from 'node:path';

export function readBuildInfo(codeRoot: string, env: NodeJS.ProcessEnv) {
  const supplied = (env.APP_VERSION || '').trim().replace(/^v/, '');
  const version = supplied || JSON.parse(fs.readFileSync(path.join(codeRoot, 'package.json'), 'utf8')).version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid build version');
  return { version, commit: env.GIT_SHA || '', buildTime: env.BUILD_TIME || '' };
}

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(/[.-]/).map(x => (/^\d+$/.test(x) ? Number(x) : x));
  const pb = b.replace(/^v/, "").split(/[.-]/).map(x => (/^\d+$/.test(x) ? Number(x) : x));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}
