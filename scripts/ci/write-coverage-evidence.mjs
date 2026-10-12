import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateCoverageReports } from './coverage-contract.mjs';
import { coverageMetrics, sha256, readCoverageInputs } from './coverage-input.mjs';

fs.mkdirSync('reports', { recursive: true });
const errors = [];
const root = process.cwd();
const evidence = {
  commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  nodeVersion: process.version, platform: process.platform, architecture: process.arch,
  lockSha256: sha256(fs.readFileSync('package-lock.json')),
  workflowRunUrl: process.env.WORKFLOW_RUN_URL, sourceInventory: [], reportHashes: {}, errors,
};
try {
  // Build/tests must not change the tracked application source behind this SHA.
  execFileSync('git', ['diff', '--quiet', 'HEAD', '--', 'src', 'server']);
  const provider = JSON.parse(fs.readFileSync('node_modules/@vitest/coverage-v8/package.json', 'utf8'));
  const baselineBytes = fs.readFileSync('docs/engineering/evidence/windows-coverage-baseline.json');
  const baseline = JSON.parse(baselineBytes);
  evidence.baselineSha256 = sha256(baselineBytes);
  evidence.providerVersion = provider.version;
  if (baseline.schema !== 1 || baseline.providerVersion !== '4.1.11' || provider.version !== baseline.providerVersion) errors.push('coverage provider/baseline policy mismatch');
  evidence.floor = baseline.floors?.[process.version];
  const input = readCoverageInputs(root, path.join(root, 'reports/coverage'));
  evidence.sourceInventory = input.sourceInventory;
  evidence.sourceInventorySha256 = sha256(JSON.stringify(input.sourceInventory));
  evidence.total = input.summary.total;
  errors.push(...validateCoverageReports({ ...input, floor: evidence.floor }));
  for (const name of ['coverage-final.json', 'coverage-summary.json', 'lcov.info', 'index.html']) evidence.reportHashes[name] = sha256(fs.readFileSync(path.join('reports/coverage', name)));
  if (!coverageMetrics.every(name => typeof evidence.floor?.[name] === 'number')) errors.push('unmeasured runtime coverage floor');
} catch (error) { errors.push(error.message); }
if (evidence.commitSha !== process.env.TEST_COMMIT_SHA || process.version !== `v${process.env.EXPECTED_NODE}` || process.platform !== 'win32' || process.arch !== 'x64') errors.push('coverage source/runtime is not requested Windows HEAD');
fs.writeFileSync('reports/coverage-evidence.json', JSON.stringify(evidence, null, 2));
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Coverage counters/LCOV agree for ${evidence.sourceInventory.length} source files; all four measured ratchets hold.`);
