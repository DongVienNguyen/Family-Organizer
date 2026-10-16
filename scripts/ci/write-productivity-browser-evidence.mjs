import fs from 'node:fs';
import {readProductivityShardInputs} from './productivity-shard-contract.mjs';
import {openReleaseReportFiles} from '../windows/release-report-files.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {browserProjects} from './browser-contract.mjs';
import {productivityBrowserCases as browserCases,productivityBrowserWorkers,validateProductivityBrowserReports as validateBrowserReports} from './productivity-browser-contract.mjs';

fs.mkdirSync('reports', { recursive: true });
const errors = [];
const read = name => {
  try { return JSON.parse(fs.readFileSync(path.join('reports', name), 'utf8')); }
  catch { errors.push(`missing or invalid ${name}`); return null; }
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const buildHash = file => { try { return sha256(fs.readFileSync(file)); } catch { errors.push(`missing production build ${file}`); return null; } };
const expected = { commitSha, lockSha256: sha256(fs.readFileSync('package-lock.json')), nodeVersion: process.version, productionBuild: { serverSha256: buildHash('dist/server.cjs'), indexSha256: buildHash('dist/index.html') } };
const report = read('productivity-browser.json');
const manifest = read('productivity-browser-fixture.json');
const engines = browserProjects.map(name => read(`productivity-browser-runtime-${name}.json`));
const exits = Object.fromEntries(['install', 'native', 'build', 'browsers-install', 'browser'].map(name => [name, read(`${name}-exit.json`)]));
const native = read('native.json');
const checks = Object.fromEntries(['install', 'native', 'build', 'browser'].map(name => [name, process.env[`CHECK_${name.toUpperCase()}`]]));
const mappedFiles={'browser-html/index.html':'productivity-browser-html/index.html','browser-run.log':'productivity-browser-run.log','browsers-install.log':'browsers-install.log','browser-server.log':'productivity-browser-server.log'};
const files=Object.keys(mappedFiles).filter(name=>fs.existsSync(path.join('reports',mappedFiles[name]))&&fs.statSync(path.join('reports',mappedFiles[name])).size>0);
const junit = fs.existsSync('reports/productivity-browser.junit.xml') ? fs.readFileSync('reports/productivity-browser.junit.xml', 'utf8') : '';
if (commitSha !== process.env.TEST_COMMIT_SHA || process.version !== `v${process.env.EXPECTED_NODE}` || process.platform !== 'win32' || process.arch !== 'x64') errors.push('requested HEAD/runtime differs from actual Windows checkout');
const touch={report:read('productivity-browser-touch.json'),runtime:read('productivity-browser-touch-runtime.json'),junit:fs.existsSync('reports/productivity-browser-touch.junit.xml')?fs.readFileSync('reports/productivity-browser-touch.junit.xml','utf8'):''};
let shards;try{shards=readProductivityShardInputs(openReleaseReportFiles(path.resolve('reports')),{workers:productivityBrowserWorkers});}catch{errors.push('missing independent productivity project evidence');}
errors.push(...validateBrowserReports({ shards, report, junit, manifest, engines, exits, native, checks, files, expected, touch }));
const hashes = {};
function record(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) record(absolute);
    else if (entry.isFile() && !absolute.endsWith('productivity-browser-evidence.json')) hashes[path.relative('reports', absolute).replaceAll('\\', '/')] = sha256(fs.readFileSync(absolute));
  }
}
record('reports');
fs.writeFileSync('reports/productivity-browser-evidence.json', JSON.stringify({ ...expected, workflowRunUrl: process.env.WORKFLOW_RUN_URL, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT), checks, engines, manifest, touch, shards, reportSha256: hashes['productivity-browser.json'], hashes, errors }, null, 2));
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`All ${browserProjects.length * browserCases.length} required browser cases passed on their first attempt; cleanup and evidence verified.`);
