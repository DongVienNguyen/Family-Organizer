import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const [packageRoot, fixtureRoot, foreignCwd, deniedDirectory, reportPath] = process.argv.slice(2);
assert.equal(process.argv.length, 7, 'Expected package/fixture/cwd/denied/report paths');
for (const value of [packageRoot, fixtureRoot, foreignCwd, deniedDirectory, reportPath]) assert.ok(path.isAbsolute(value));
assert.equal(fs.existsSync(path.join(packageRoot, 'server.ts')), false);
for (const dependency of ['tsx', 'vitest', 'typescript']) assert.equal(fs.existsSync(path.join(packageRoot, 'node_modules', dependency)), false, `Development dependency present: ${dependency}`);
const dataRoot = path.join(fixtureRoot, 'dữ liệu gia đình');
const configRoot = path.join(fixtureRoot, 'cấu hình');
const logRoot = path.join(fixtureRoot, 'log files');
for (const directory of [dataRoot, configRoot, logRoot]) fs.mkdirSync(directory, { recursive: true });
const salt = 'synthetic-test-salt';
const password = 'synthetic-only-password';
const passwordHash = `${salt}$${crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex')}`;
const legacy = { users: [{ id: 'synthetic-adult', username: 'synthetic', fullName: 'Synthetic adult', role: 'admin', passwordHash }], tasks: [{ id: 'synthetic-task', title: 'Giữ ID', createdById: 'synthetic-adult', assignedToId: 'synthetic-adult', status: 'todo' }] };
fs.writeFileSync(path.join(dataRoot, 'db.json'), JSON.stringify(legacy));
fs.writeFileSync(path.join(configRoot, 'session_secret.key'), 'synthetic-session-key');
fs.writeFileSync(path.join(configRoot, 'app_settings.json'), JSON.stringify({ marker: 'synthetic' }));
const networkFile = path.join(fixtureRoot, 'external-attempts.jsonl');
const blockNetwork = fileURLToPath(new URL('./block-network.cjs', import.meta.url));
const Database = createRequire(path.join(packageRoot, 'package.json'))('better-sqlite3');
const env = { ...process.env, NODE_ENV: 'production', DATA_DIR: dataRoot, CONFIG_DIR: configRoot, LOG_DIR: logRoot, FO_NETWORK_ATTEMPTS: networkFile };
for (const name of ['APP_CODE_ROOT', 'APP_VERSION', 'GEMINI_API_KEY', 'API_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'NODE_OPTIONS']) delete env[name];
let child;
let serverOutput = '';
async function stop() {
  if (!child) return;
  const current = child;
  child = undefined;
  if (current.exitCode === null && current.signalCode === null) {
    const exited = once(current, 'exit');
    current.stdin.write('stop\n');
    const timer = setTimeout(() => current.kill('SIGKILL'), 5000);
    try { const [code, signal] = await exited; assert.equal(signal, null); assert.equal(code, 0, serverOutput); assert.match(serverOutput, /Shutdown complete/); } finally { clearTimeout(timer); }
  }
}
function request(port, pathname, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {} }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.setTimeout(2000, () => req.destroy(new Error('HTTP probe timeout')));
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
async function launch(dataDirectory = dataRoot) {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  child = spawn(process.execPath, ['--require', blockNetwork, path.join(packageRoot, 'dist', 'server.cjs')], { cwd: foreignCwd, env: { ...env, DATA_DIR: dataDirectory, PORT: String(port) }, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdout.on('data', text => { serverOutput += text; });
  child.stderr.on('data', text => { serverOutput += text; });
  child.on('error', error => { serverOutput += error.message; });
  return port;
}
try {
  for (let iteration = 0; iteration < 2; iteration++) {
    const port = await launch();
    const deadline = Date.now() + 15000;
    let health;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Production process exited before ready: ${serverOutput}`);
      try { health = await request(port, '/api/health'); } catch { /* wait for startup, not a retry of a test */ }
      if (health?.status === 200) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(health?.status, 200, `Startup timeout: ${serverOutput}`);
    const ready = await request(port, '/api/ready'); assert.equal(ready.status, 200); assert.equal(JSON.parse(ready.text).ready, true);
    assert.equal(JSON.parse(health.text).version, JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version);
    const html = await request(port, '/');
    assert.equal(html.status, 200);
    assert.match(html.text, /<div id="root"/);
    assert.equal((await request(port, '/sw.js')).status, 200);
    const login = await request(port, '/api/auth/login', { username: 'synthetic', password });
    assert.equal(login.status, 200, login.text);
    assert.equal(JSON.parse(login.text).user.id, 'synthetic-adult');
    await stop();
    assert.ok(fs.existsSync(path.join(dataRoot, 'family.db')));
    const db = new Database(path.join(dataRoot, 'family.db'), { readonly: iteration !== 0 });
    try {
      const storedTask = JSON.parse(db.prepare('SELECT data FROM tasks WHERE id = ?').get('synthetic-task').data);
      assert.equal(storedTask.title, iteration === 0 ? 'Giữ ID' : 'Changed after import');
      if (iteration === 0) {
        storedTask.title = 'Changed after import';
        db.prepare('UPDATE tasks SET data = ? WHERE id = ?').run(JSON.stringify(storedTask), 'synthetic-task');
      }
      assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    } finally { db.close(); }
  }
  // Compiled crash/restart: commit into the active WAL, then terminate abruptly.
  async function waitReady(port) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(serverOutput);
      try { const response = await request(port, '/api/ready'); if (response.status === 200 && JSON.parse(response.text).ready === true) return; } catch { /* startup wait */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Compiled crash/restart readiness timeout');
  }
  let crashPort = await launch(); await waitReady(crashPort);
  const activeDb = new Database(path.join(dataRoot, 'family.db'));
  try {
    const task = JSON.parse(activeDb.prepare('SELECT data FROM tasks WHERE id = ?').get('synthetic-task').data);
    task.title = 'Committed before crash';
    activeDb.prepare('UPDATE tasks SET data = ? WHERE id = ?').run(JSON.stringify(task), 'synthetic-task');
  } finally { activeDb.close(); }
  const crashExit = once(child, 'exit'); child.kill('SIGKILL'); await crashExit; child = undefined;
  crashPort = await launch(); await waitReady(crashPort); await stop();
  const recovered = new Database(path.join(dataRoot, 'family.db'));
  try {
    assert.equal(JSON.parse(recovered.prepare('SELECT data FROM tasks WHERE id = ?').get('synthetic-task').data).title, 'Committed before crash');
    assert.equal(recovered.pragma('integrity_check', { simple: true }), 'ok');
  } finally { recovered.close(); }
  const outputBeforeDenial = serverOutput.length;
  await launch(deniedDirectory);
  const failed = child;
  const timeout = setTimeout(() => failed.kill('SIGKILL'), 10000);
  const [exitCode] = await once(failed, 'exit');
  clearTimeout(timeout);
  assert.notEqual(exitCode, 0);
  assert.match(serverOutput.slice(outputBeforeDenial), /not writable/);
  assert.equal(fs.readFileSync(path.join(configRoot, 'session_secret.key'), 'utf8'), 'synthetic-session-key');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(configRoot, 'app_settings.json'), 'utf8')), { marker: 'synthetic' });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataRoot, 'db.json'), 'utf8')), legacy);
  assert.equal(fs.existsSync(networkFile) ? fs.readFileSync(networkFile, 'utf8') : '', '');
  const report = { commitSha: process.env.TEST_COMMIT_SHA, nodeVersion: process.version, platform: process.platform, architecture: process.arch,
    cwd: foreignCwd, productionRoot: packageRoot,
    checks: ['production-dependencies-only', 'no-source-ts', 'foreign-cwd', 'static-assets', 'legacy-preserved', 'restart-persistence', 'write-permission-fail-fast', 'offline-providers', 'graceful-shutdown', 'readiness', 'crash-recovery'] };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await stop();
  fs.writeFileSync(path.join(path.dirname(reportPath), 'production-server.log'), serverOutput);
}
