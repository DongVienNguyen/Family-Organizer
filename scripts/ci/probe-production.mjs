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
import { probeFirstAccount } from './probe-first-account.mjs';

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
// Mixed private/shared fixtures exercise compiled actor filtering, not only startup.
legacy.users.push({id:'synthetic-child',username:'synthetic-child',fullName:'Synthetic child',role:'child',passwordHash});
Object.assign(legacy.tasks[0],{creatorId:'synthetic-adult',assigneeId:'synthetic-adult',isShared:false});
const shared={creatorId:'synthetic-adult',isShared:true,description:'synthetic visibility',createdAt:'2026-10-11',updatedAt:'2026-10-11'};
legacy.plans=[{...shared,id:'synthetic-shared-plan',title:'Synthetic shared',startDate:'2026-10-11 09:00'}, {...shared,id:'synthetic-private-plan',title:'Synthetic private',startDate:'2026-10-11 09:00',isShared:false}];
legacy.notes=[{...shared,id:'synthetic-shared-note',title:'Synthetic shared',content:'synthetic visibility',allowedRolesToEdit:[]}, {...shared,id:'synthetic-private-note',title:'Synthetic private',content:'synthetic visibility',allowedRolesToEdit:[],isShared:false}];
legacy.healthProfiles=['synthetic-child','synthetic-adult'].map(userId=>({id:'hp_'+userId,userId,emergencyContacts:[],createdAt:'2026-10-11',updatedAt:'2026-10-11'}));
const mediaPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1kAAAAASUVORK5CYII=','base64');
fs.mkdirSync(path.join(dataRoot,'uploads','notes'),{recursive:true});
for(const scope of ['shared','private']){fs.writeFileSync(path.join(dataRoot,'uploads','notes',scope+'.png'),mediaPng);legacy.notes.find(row=>row.id==='synthetic-'+scope+'-note').content+=' ![synthetic](/uploads/notes/'+scope+'.png)';}
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
function request(port, pathname, body, token, method) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method: method ?? (body ? 'POST' : 'GET'), headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),...(token?{Authorization:'Bearer '+token}:{}) } }, res => {
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({status:res.statusCode,text:bytes.toString('utf8'),bytes,headers:res.headers});});
    });
    req.setTimeout(2000, () => req.destroy(new Error('HTTP probe timeout')));
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
// Bound the entire SSE handshake, including silent or endless responses.
function probeRealtime(port, token) {
  return new Promise((resolve, reject) => {
    let response;
    let text = '';
    let passed = false;
    const req = http.get({hostname: '127.0.0.1', port, path: '/api/realtime', agent: false,
      headers: {Authorization: 'Bearer ' + token, Accept: 'text/event-stream'}}, res => {
      response = res;
      res.setEncoding('utf8');
      res.on('error', reject);
      res.once('close', () => {clearTimeout(timer); if (passed) resolve(); else reject(new Error('SSE closed before initialization'));});
      try {
        assert.equal(res.statusCode, 200);
        assert.match(res.headers['content-type'] || '', /text\/event-stream/);
        assert.equal(res.headers['cache-control'], 'no-store');
        res.on('data', chunk => {
          try {
            text += chunk;
            assert.ok(Buffer.byteLength(text) <= 65536, 'SSE initialization too large');
            if (!text.includes('\n\n')) return;
            const frame = JSON.parse(text.split('\n\n')[0].replace(/^data: /, ''));
            assert.equal(frame.type, 'init');
            passed = true;
            res.destroy();
          } catch (error) {reject(error); res.destroy();}
        });
      } catch (error) {reject(error); res.destroy();}
    });
    const timer = setTimeout(() => {const error = new Error('SSE absolute handshake timeout'); reject(error); response?.destroy(); req.destroy();}, 2000);
    req.on('error', error => {clearTimeout(timer); reject(error);});
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
  await probeFirstAccount({packageRoot,fixtureRoot,foreignCwd,blockNetwork,env,Database});
  let previousToken;
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
    if(previousToken)assert.equal((await request(port,'/api/auth/me',undefined,previousToken)).status,200,'Issued session must survive a graceful process restart');
    const login = await request(port, '/api/auth/login', { username: 'synthetic', password });
    assert.equal(login.status, 200, login.text);
    assert.equal(JSON.parse(login.text).user.id, 'synthetic-adult');
    const token=JSON.parse(login.text).token;assert.match(token,/^fo1\./);assert.equal(login.headers['cache-control'],'no-store');
    assert.equal((await request(port,'/api/auth/me',undefined,token)).status,200);
    const privateUsers=await request(port,'/api/users',undefined,token);assert.equal(privateUsers.status,200);assert.equal(privateUsers.headers['cache-control'],'no-store');assert.match(privateUsers.headers.vary,/Authorization/i);
    const unauthorizedUsers=await request(port,'/api/users');assert.equal(unauthorizedUsers.status,401);assert.equal(unauthorizedUsers.headers['cache-control'],'no-store');
    const absentMedia=await request(port,'/uploads/synthetic-not-present.png',undefined,token);assert.equal(absentMedia.status,404);assert.equal(absentMedia.headers['cache-control'],'no-store');
    assert.equal((await request(port,'/api/realtime')).status,401);
    assert.equal((await request(port,'/api/realtime?token='+encodeURIComponent(token))).status,401);
    await probeRealtime(port,token);
    const childLogin=await request(port,'/api/auth/login',{username:'synthetic-child',password});assert.equal(childLogin.status,200);const childToken=JSON.parse(childLogin.text).token;
    assert.equal((await request(port,'/uploads/notes/shared.png')).status,401);
    assert.equal((await request(port,'/uploads/notes/shared.png?token='+encodeURIComponent(token))).status,401);
    const sharedMedia=await request(port,'/uploads/notes/shared.png',undefined,childToken);assert.equal(sharedMedia.status,200);assert.deepEqual(sharedMedia.bytes,mediaPng);assert.equal(sharedMedia.headers['cache-control'],'no-store');assert.equal(sharedMedia.headers['x-content-type-options'],'nosniff');assert.match(sharedMedia.headers['content-type'],/^image\/png/);
    const deniedMedia=await request(port,'/uploads/notes/private.png',undefined,childToken);assert.equal(deniedMedia.status,404);assert.equal(deniedMedia.text,(await request(port,'/uploads/notes/missing.png',undefined,childToken)).text);
    assert.equal((await request(port,'/uploads/notes/private.png',undefined,token)).status,200);
    const staged=await request(port,'/api/uploads',{category:'notes',dataUrl:'data:image/png;base64,'+mediaPng.toString('base64')},token);assert.equal(staged.status,200);const mediaUrl=JSON.parse(staged.text).url;
    assert.equal((await request(port,mediaUrl,undefined,token)).status,200);assert.equal((await request(port,mediaUrl,undefined,childToken)).status,404);
    const bound=await request(port,'/api/notes',{title:'Synthetic bound media',content:'![synthetic]('+mediaUrl+')',isShared:false},token);assert.equal(bound.status,200);const boundId=JSON.parse(bound.text).note.id;
    assert.equal((await request(port,mediaUrl,undefined,token)).status,200);
    // Remove its attachment and record through ordinary owner routes; the binding remains a tombstone.
    const unbound=await request(port,'/api/notes',{id:boundId,title:'Synthetic bound media',content:'synthetic removed attachment',isShared:false},token);assert.equal(unbound.status,200);assert.equal((await request(port,mediaUrl,undefined,token)).status,404);
    assert.equal((await request(port,'/api/notes/'+boundId,undefined,token,'DELETE')).status,200);
    const visibleNotes=await request(port,'/api/notes',undefined,childToken);assert.equal(visibleNotes.status,200);assert.deepEqual(JSON.parse(visibleNotes.text).notes.map(row=>row.id),['synthetic-shared-note']);
    const visiblePlans=await request(port,'/api/plans',undefined,childToken);assert.equal(visiblePlans.status,200);assert.deepEqual(JSON.parse(visiblePlans.text).plans.map(row=>row.id),['synthetic-shared-plan']);
    const visibleTasks=await request(port,'/api/tasks',undefined,childToken);assert.equal(visibleTasks.status,200);assert.deepEqual(JSON.parse(visibleTasks.text).tasks,[]);
    assert.equal((await request(port,'/api/finance',undefined,childToken)).status,403);
    const visibleHealth=await request(port,'/api/child-health',undefined,childToken);assert.equal(visibleHealth.status,200);assert.deepEqual(JSON.parse(visibleHealth.text).healthProfiles.map(row=>row.userId),['synthetic-child']);
    const search=await request(port,'/api/search?q=synthetic',undefined,childToken);assert.equal(search.status,200);assert.equal(search.text.includes('synthetic-private'),false);assert.equal(search.text.includes('synthetic-shared-note'),true);
    const feedInfo=await request(port,'/api/calendar/feed-info',undefined,childToken);assert.equal(feedInfo.status,200);const calendar=await request(port,'/api/calendar.ics?token='+encodeURIComponent(JSON.parse(feedInfo.text).token));assert.equal(calendar.status,200);assert.match(calendar.text,/synthetic-shared-plan/);assert.equal(calendar.text.includes('synthetic-private-plan'),false);

    // Compiled native task authority, Child submission and exactly-once rewards.
    const rewardBase=JSON.parse((await request(port,'/api/rewards',undefined,token)).text).entries.length;
    const taskCreate=await request(port,'/api/tasks',{title:'Synthetic authority probe',assigneeId:'synthetic-child',isShared:false,rewardPoints:20},token);assert.equal(taskCreate.status,200);const taskId=JSON.parse(taskCreate.text).task.id;
    assert.equal((await request(port,'/api/tasks',{id:taskId,rewardPoints:999,status:'completed'},childToken)).status,403);
    assert.equal((await request(port,'/api/tasks',{id:taskId,assigneeId:'synthetic-adult',submittedById:'synthetic-child',status:'completed'},childToken)).status,403);
    const submitted=await request(port,'/api/tasks',{id:taskId,status:'completed',proofNote:'Synthetic completed'},childToken);assert.equal(submitted.status,200);assert.equal(JSON.parse(submitted.text).task.pendingApproval,true);assert.equal(JSON.parse(submitted.text).task.submittedById,'synthetic-child');
    assert.equal((await request(port,'/api/tasks',{id:taskId,assigneeId:'synthetic-adult',status:'completed'},childToken)).status,403);
    assert.equal(JSON.parse((await request(port,'/api/rewards',undefined,token)).text).entries.length,rewardBase);
    assert.equal((await request(port,'/api/tasks/'+taskId+'/approve',{},token)).status,200);
    assert.equal((await request(port,'/api/tasks',{id:taskId,status:'completed'},token)).status,200);
    assert.equal(JSON.parse((await request(port,'/api/rewards',undefined,token)).text).entries.length,rewardBase+1);
    assert.equal((await request(port,'/api/tasks',{id:taskId,status:'todo'},childToken)).status,200);
    assert.equal((await request(port,'/api/tasks',{id:taskId,status:'completed'},childToken)).status,200);
    assert.equal((await request(port,'/api/tasks/'+taskId+'/approve',{},token)).status,200);
    const rewards=JSON.parse((await request(port,'/api/rewards',undefined,token)).text).entries;assert.equal(rewards.length,rewardBase+2);assert.deepEqual(rewards.filter(row=>row.taskId===taskId).map(row=>row.points),[20,20]);
    assert.equal((await request(port,'/api/tasks/'+taskId,undefined,token,'DELETE')).status,200);

    // Compiled content grants do not delegate ownership/privacy changes.
    // Current source ACL also applies to reward history and queued-derived notices.
    const childRewards=await request(port,'/api/rewards',undefined,childToken);assert.equal(childRewards.status,200);
    assert.equal(childRewards.text.includes(taskId),false);assert.equal(childRewards.text.includes('Synthetic authority probe'),false);
    const adultBalances=JSON.parse((await request(port,'/api/rewards',undefined,token)).text).totals;
    assert.deepEqual(JSON.parse(childRewards.text).totals,adultBalances,'Privacy must not change the existing family point balances');
    const childNotices=await request(port,'/api/notifications',undefined,childToken);assert.equal(childNotices.status,200);assert.equal(childNotices.text.includes('Synthetic authority probe'),false);
    assert.equal((await request(port,'/api/notifications/send',{toUserId:'synthetic-child',message:'Synthetic authorized nudge'},token)).status,200);
    const nudge=JSON.parse((await request(port,'/api/notifications',undefined,childToken)).text).notifications.find(row=>row.content==='Synthetic authorized nudge');assert.ok(nudge);assert.equal((await request(port,'/api/notifications/'+nudge.id+'/read',{},childToken)).status,200);

    const noteCreate=await request(port,'/api/notes',{title:'Synthetic delegated content',isShared:true,allowedRolesToEdit:['child']},token);assert.equal(noteCreate.status,200);const noteId=JSON.parse(noteCreate.text).note.id;
    for(const payload of [{creatorId:'synthetic-child'},{isShared:false},{allowedRolesToEdit:['admin','child']}])assert.equal((await request(port,'/api/notes',{id:noteId,...payload},childToken)).status,403);
    const noteEdit=await request(port,'/api/notes',{id:noteId,content:'Synthetic authorized content'},childToken);assert.equal(noteEdit.status,200);assert.equal(JSON.parse(noteEdit.text).note.creatorId,'synthetic-adult');assert.equal(JSON.parse(noteEdit.text).note.isShared,true);
    const staleNote=await request(port,'/api/notes',{id:noteId,title:'Synthetic stale content',baseUpdatedAt:'2026-01-01T00:00:00Z'},token);assert.equal(staleNote.status,409);assert.equal(JSON.parse(staleNote.text).conflict,true);
    assert.equal((await request(port,'/api/notes',{content:42},token)).status,400);
    assert.equal((await request(port,'/api/notes/'+noteId,undefined,token,'DELETE')).status,200);
    const planCreate=await request(port,'/api/plans',{title:'Synthetic Child schedule',startDate:'2026-10-11 09:00',endDate:'2026-10-11 10:00',recurrenceWeekdays:[0,2]},childToken);assert.equal(planCreate.status,200);const planId=JSON.parse(planCreate.text).plan.id;
    assert.equal((await request(port,'/api/plans',{id:planId,creatorId:'synthetic-adult'},childToken)).status,403);
    assert.equal((await request(port,'/api/plans',{title:'Synthetic invalid schedule',startDate:'2026-02-30 09:00'},token)).status,400);
    assert.equal((await request(port,'/api/plans/'+planId,undefined,childToken,'DELETE')).status,200);
    const docCreate=await request(port,'/api/documents',{title:'Synthetic content document',type:'other',files:[]},token);assert.equal(docCreate.status,200);const docId=JSON.parse(docCreate.text).document.id;
    assert.equal((await request(port,'/api/documents',undefined,childToken)).status,403);
    assert.equal((await request(port,'/api/documents',{id:docId,title:'Synthetic content document',type:'other',creatorId:'synthetic-child'},token)).status,403);
    assert.equal((await request(port,'/api/documents',{title:'Synthetic invalid files',type:'other',files:'forged'},token)).status,400);
    assert.equal((await request(port,'/api/documents/'+docId,undefined,token,'DELETE')).status,200);

    if(iteration===1){
      assert.equal((await request(port,'/api/auth/logout',{},token)).status,200);
      assert.equal((await request(port,'/api/auth/me',undefined,token)).status,401);
      assert.equal((await request(port,'/api/auth/me',undefined,previousToken)).status,200,'Logout must not revoke a separate active session');
    }else previousToken=token;
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
    checks: ['production-dependencies-only', 'no-source-ts', 'foreign-cwd', 'static-assets', 'legacy-preserved', 'restart-persistence', 'write-permission-fail-fast', 'offline-providers', 'graceful-shutdown', 'readiness', 'crash-recovery', 'auth-session-restart', 'auth-session-logout', 'private-response-cache', 'authenticated-realtime', 'object-visibility', 'authenticated-media', 'task-write-authority', 'content-write-authority', 'derived-object-privacy', 'explicit-first-account'] };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await stop();
  fs.writeFileSync(path.join(path.dirname(reportPath), 'production-server.log'), serverOutput);
}
