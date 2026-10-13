import assert from 'node:assert/strict';
import {StringDecoder} from 'node:string_decoder';
import {createBrowserProtocolCapture,createBrowserDriverCapture,observeBrowserChildCompletion,launchWithBrowserDiagnostic} from './browser-protocol.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createHash, pbkdf2Sync } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';

const root = process.cwd();
const reports = path.join(root, 'reports');
fs.mkdirSync(reports, { recursive: true });
const require = createRequire(import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const Database = require('better-sqlite3');
const nativeProbe = new Database(':memory:');
nativeProbe.close();
const binaries = Object.keys(require.cache).filter(file => file.endsWith('.node') && file.includes('better-sqlite3'));
assert.equal(binaries.length, 1, 'Expected exactly one loaded SQLite addon');
const manifest = {
  commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  nodeVersion: process.version, platform: process.platform, architecture: process.arch,
  lockSha256: sha256(fs.readFileSync(path.join(root, 'package-lock.json'))),
  addonSha256: sha256(fs.readFileSync(binaries[0])),
  productionBuild: { serverSha256: sha256(fs.readFileSync(path.join(root, 'dist/server.cjs'))), indexSha256: sha256(fs.readFileSync(path.join(root, 'dist/index.html'))) },
  legacyPreserved: false, integrity: null, databaseClosed: false, fixtureRemoved: false,
  externalAttempts: [], serverExitCode: null, serverSignal: null, cliExitCode: null, cliSignal: null,
};
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'family-browser dữ liệu '));
const data = path.join(fixture, 'data');
const config = path.join(fixture, 'config');
const logs = path.join(fixture, 'logs');
const cwd = path.join(fixture, 'foreign cwd');
const networkFile = path.join(fixture, 'external-attempts.jsonl');
const providersFile = path.join(fixture, 'offline-dashboard-fixtures.txt');
let diagnosticFd;
const closeDiagnostic=()=>{if(diagnosticFd!==undefined){const fd=diagnosticFd;diagnosticFd=undefined;fs.closeSync(fd);}};
let server, cli, serverExited, serverOutput = '', cliOutput = '', failure, protocolSelected=false;
function capture(child, name) {
  child.stdin?.on('error', () => {});
  const exited=observeBrowserChildCompletion(child);
  exited.then(result=>{if(!result.outputClosed)failure??=new Error('native output close incomplete');},()=>{});
  const append = bytes => {
    if (name === 'server') serverOutput += bytes.toString(); else cliOutput += bytes.toString();
    if(name==='cli'&&cliOutput.includes('B09_PROTOCOL_WINDOW webkit'))protocolSelected=true;
    if (Buffer.byteLength(name === 'server' ? serverOutput : cliOutput) > 65536) { failure ??= new Error(`${name} output limit exceeded`); child.kill('SIGKILL'); }
  };
  child.stdout.on('data', append);
  if(name==='cli'&&process.env.FO_BROWSER_PROTOCOL_DIAGNOSTICS==='1'){
    const fd=diagnosticFd,decoder=new StringDecoder('utf8');
    const sink=createBrowserProtocolCapture({writeRecord:line=>assert.equal(fs.writeSync(fd,line),Buffer.byteLength(line),'protocol diagnostic write incomplete'),appendOrdinary:line=>append(Buffer.from(line)),acceptRecord:()=>protocolSelected});
    let failed=false;
    const record=text=>{if(failed)return;try{sink.writeText(text);}catch{failed=true;failure??=new Error('browser protocol diagnostic budget rejected');child.kill('SIGKILL');}};
    child.stderr.on('data',bytes=>record(decoder.write(bytes)));
    child.stderr.once('end',()=>{try{record(decoder.end());if(!failed)sink.end();}catch{failure??=new Error('browser protocol diagnostic incomplete');child.kill('SIGKILL');}finally{closeDiagnostic();}});
  }else if(name==='cli'){
    const fd=diagnosticFd,decoder=new StringDecoder('utf8');
    const sink=createBrowserDriverCapture({writeRecord:line=>assert.equal(fs.writeSync(fd,line),Buffer.byteLength(line),'driver diagnostic write incomplete'),appendOrdinary:line=>append(Buffer.from(line))});
    let failed=false;const record=text=>{if(failed)return;try{sink.writeText(text);}catch{failed=true;failure??=new Error('browser driver diagnostic budget rejected');child.kill('SIGKILL');}};
    child.stderr.on('data',bytes=>record(decoder.write(bytes)));
    child.stderr.once('end',()=>{try{record(decoder.end());if(!failed)sink.end();}catch{failure??=new Error('browser driver diagnostic incomplete');child.kill('SIGKILL');}finally{closeDiagnostic();}});
  }else child.stderr.on('data',append);
  return exited;
}
async function stopServer() {
  if (!server) return;
  if (server.exitCode === null && server.signalCode === null) server.stdin.write('stop\n');
  const timer = setTimeout(() => server.kill('SIGKILL'), 7000);
  try {
    const { code, signal } = await serverExited;
    manifest.serverExitCode = code; manifest.serverSignal = signal;
    assert.equal(code, 0, 'compiled server did not exit successfully');
    assert.equal(signal, null, 'compiled server was forcibly terminated');
    assert.match(serverOutput, /Shutdown complete/);
  } finally { clearTimeout(timer); }
}
try {
  for (const dir of [data, config, logs, cwd]) fs.mkdirSync(dir);
  const salt = '00112233445566778899aabbccddeeff';
  const passwordHash = `${salt}$${pbkdf2Sync('synthetic-browser-password', salt, 120000, 64, 'sha512').toString('hex')}`;
  const users = ['admin', 'member', 'child', 'guest'].map(role => ({ id: `browser-${role}`, username: `browser-${role}`, fullName: `Synthetic ${role}`, role, passwordHash }));
  const note = (scope, creatorId, isShared) => ({ id: `browser-note-${scope}`, title: `Synthetic ${scope} note`, content: `Synthetic ${scope} content ![synthetic ${scope}](/uploads/notes/${scope}.png)`, tags: [], isPinned: false, creatorId, isShared, allowedRolesToEdit: [], createdAt: '2026-10-12', updatedAt: '2026-10-12' });
  const legacy = { users, notes: [note('private', 'browser-member', false), note('shared', 'browser-admin', true), note('child', 'browser-child', false)], transactions: [{ id: 'browser-finance', amount: 123456, type: 'expense', category: 'food', date: '2026-10-12', description: 'Synthetic adult finance' }] };
  // Stored synthetic notices only: seed data bypasses all send/outbox adapters.
  legacy.notifications = ['member', 'child'].flatMap(role => ['chromium', 'firefox', 'webkit'].map(engine => ({
    id: 'browser-notification-' + role + '-' + engine, userId: 'browser-' + role,
    title: 'Synthetic ' + role + ' notification ' + engine, content: 'Synthetic stored-only notice',
    type: 'note', sourceRef: { domain: 'note', id: role === 'member' ? 'browser-note-private' : 'browser-note-child' },
    isRead: false, createdAt: '2026-10-13T00:00:00.000Z',
  })));
  const legacyText = JSON.stringify(legacy);
  fs.writeFileSync(path.join(data, 'db.json'), legacyText);
  fs.writeFileSync(path.join(config, 'app_settings.json'), '{}');
  fs.mkdirSync(path.join(data, 'uploads/notes'), { recursive: true });
  // Valid chunk CRCs matter: this fixture must decode in real browsers.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
  for (const scope of ['private', 'shared', 'child']) fs.writeFileSync(path.join(data, 'uploads/notes', `${scope}.png`), png);
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${port}`;
  // The app receives no Actions/GitHub/provider credentials from the runner.
  const env = {};
  const permitted = new Set(['path', 'systemroot', 'windir', 'systemdrive', 'comspec', 'pathext', 'temp', 'tmp', 'localappdata', 'tz']);
  for (const [key, value] of Object.entries(process.env)) if (permitted.has(key.toLowerCase())) env[key] = value;
  Object.assign(env, { NODE_ENV: 'production', DATA_DIR: data, CONFIG_DIR: config, LOG_DIR: logs, PORT: String(port), FO_NETWORK_ATTEMPTS: networkFile, FO_BROWSER_PROVIDER_FIXTURES: providersFile });
  server = spawn(process.execPath, ['--require', path.join(root, 'scripts/ci/block-network.cjs'), '--require', path.join(root, 'scripts/ci/browser-providers.cjs'), path.join(root, 'dist/server.cjs')], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  serverExited = capture(server, 'server');
  const deadline = Date.now() + 20_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null || failure) throw failure || new Error('compiled server exited before readiness');
    try { const response = await fetch(`${origin}/api/ready`, { signal: AbortSignal.timeout(1000) }); if (response.status === 200) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(ready, true, 'production server readiness deadline exceeded');
  const cliEnv={...process.env,FO_BROWSER_BASE_URL:origin,DEBUG:'pw:browser'};
  if(process.env.FO_BROWSER_PROTOCOL_DIAGNOSTICS==='1'){cliEnv.DEBUG='pw:protocol';cliEnv.MAX_LOG_LENGTH='262144';}
  const launched=launchWithBrowserDiagnostic(path.join(reports,process.env.FO_BROWSER_PROTOCOL_DIAGNOSTICS==='1'?'browser-protocol.jsonl':'browser-driver.jsonl'),()=>spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', path.join(root, 'playwright.config.ts')], { cwd: root, env: cliEnv, stdio: ['ignore', 'pipe', 'pipe'] }));
  cli=launched.child;diagnosticFd=launched.fd;
  const cliExited = capture(cli, 'cli');
  const timer = setTimeout(() => { failure ??= new Error('browser CLI absolute deadline exceeded'); cli.kill('SIGKILL'); }, 12 * 60_000);
  try { const { code, signal } = await cliExited; manifest.cliExitCode = code; manifest.cliSignal = signal; }
  finally { clearTimeout(timer); }
  assert.equal(manifest.cliExitCode, 0, 'Playwright native exit was nonzero');
  assert.equal(manifest.cliSignal, null, 'Playwright was terminated');
} catch (error) { failure ??= error; }
finally {
  try { closeDiagnostic(); } catch(error){failure??=error;}
  try { await stopServer(); } catch (error) { failure ??= error; }
  try {
    const db = new Database(path.join(data, 'family.db'), { readonly: true, fileMustExist: true });
    try {
      manifest.integrity = db.pragma('integrity_check', { simple: true });
      assert.equal(manifest.integrity, 'ok');
      const roles = db.prepare('SELECT data FROM users ORDER BY seq').all().map(row => { const user = JSON.parse(row.data); return [user.id, user.role]; });
      assert.deepEqual(roles, ['admin', 'member', 'child', 'guest'].map(role => [`browser-${role}`, role]));
      const originalText = fs.readFileSync(path.join(data, 'db.json'), 'utf8');
      const original = JSON.parse(originalText);
      assert.deepEqual(original.users.map(user => [user.id, user.role]), roles);
      manifest.legacyPreserved = true;
    } finally { db.close(); manifest.databaseClosed = !db.open; }
  } catch (error) { failure ??= error; }
  if (fs.existsSync(networkFile)) manifest.externalAttempts = fs.readFileSync(networkFile, 'utf8').split('\n').filter(Boolean);
  if (manifest.externalAttempts.length) failure ??= new Error('server attempted external provider access');
  fs.writeFileSync(path.join(reports, 'browser-server.log'), serverOutput || 'server did not produce output\n');
  fs.writeFileSync(path.join(reports, 'browser-cli.log'), cliOutput || 'browser CLI did not start\n');
  fs.writeFileSync(path.join(reports, 'browser-provider-fixtures.log'), fs.existsSync(providersFile) ? fs.readFileSync(providersFile) : 'no dashboard fixture requests\n');
  try { fs.rmSync(fixture, { recursive: true, force: false }); manifest.fixtureRemoved = !fs.existsSync(fixture); } catch (error) { failure ??= error; }
  fs.writeFileSync(path.join(reports, 'browser-fixture.json'), JSON.stringify({ ...manifest, error: failure?.message || null }, null, 2));
}
console.log(cliOutput);
if (failure) { console.error(failure.message); process.exitCode = 1; }
