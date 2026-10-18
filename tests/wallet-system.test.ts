import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { encryptRecovery, decryptRecovery } from '../server/recoveryEnvelope.js';
import { checksum } from '../server/snapshotValidation.js';
const repo = path.resolve(import.meta.dirname, '..'), tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const url = (name: string) => JSON.stringify(pathToFileURL(path.join(repo, name)).href);
async function scenario(tamper: boolean) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet system recovery synthetic ')), attempts = path.join(root, 'network.jsonl');
    const env = (name: string): NodeJS.ProcessEnv => { const values: NodeJS.ProcessEnv = { DATA_DIR: path.join(root, name, 'data'), CONFIG_DIR: path.join(root, name, 'config'), LOG_DIR: path.join(root, name, 'logs'), APP_CODE_ROOT: repo, PORT: '0', NODE_ENV: 'production', FO_NETWORK_ATTEMPTS: attempts }; for (const [key, value] of Object.entries(process.env))
        if (['path', 'systemroot', 'windir', 'systemdrive', 'comspec', 'pathext', 'temp', 'tmp', 'localappdata', 'tz'].includes(key.toLowerCase()))
            values[key] = value; return values; };
    async function run(name: string, args: string[], input?: unknown) { const child = spawn(process.execPath, ['--require', path.join(repo, 'scripts/ci/block-network.cjs'), '--import', tsx, ...args], { cwd: repo, env: env(name), stdio: ['pipe', 'pipe', 'pipe'] }); let output = ''; child.stdout.on('data', bytes => output += bytes); child.stderr.on('data', bytes => output += bytes); child.stdin.on('error', () => { }); child.stdin.end(input === undefined ? '' : JSON.stringify(input)); const timer = setTimeout(() => child.kill('SIGKILL'), 15000); try {
        const result = await new Promise<{
            code: number | null;
            signal: string | null;
        }>((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
        expect(result.signal, output).toBeNull();
        return { ...result, output };
    }
    finally {
        clearTimeout(timer);
        if (child.exitCode === null && child.signalCode === null)
            child.kill('SIGKILL');
    } }
    try {
        for (const name of ['source', 'target']) {
            const v = env(name);
            const prepared = await run(name, [path.join(repo, 'scripts/ci/write-wallet-browser-fixture.ts'), v.DATA_DIR!, v.CONFIG_DIR!, '--settings']);
            expect(prepared.code, prepared.output).toBe(0);
            if (name === 'source') {
                const seeded = await run(name, [path.join(repo, 'tests/wallet-system-seed.ts')]);
                expect(seeded.code, seeded.output).toBe(0);
            }
        }
        const targetSession = await run('target', ['--input-type=module', '--eval', `import assert from 'node:assert/strict';const sqlite=await import(${url('server/sqlite.ts')});const {NativeSessionStore}=await import(${url('server/authStore.ts')});const {createAuth}=await import(${url('server/auth.ts')});try{const users=()=>sqlite.sqliteLoad().users,auth=createAuth({store:new NativeSessionStore(),getUsers:users,getSecret:()=> 'synthetic-wallet-recovery-session-key'});auth.issue(users().find(user=>user.role==='admin'));assert.equal(sqlite.sqliteConnection().prepare('SELECT count(*) AS n FROM auth_sessions').get().n,1);}finally{sqlite.sqliteClose();}`]);
        expect(targetSession.code, targetSession.output).toBe(0);
        const key = randomBytes(32).toString('hex'), file = path.join(root, 'wallet.fo-recovery'), request = { file, key, includeCredentials: true };
        const capture = `import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';const {startApplication}=await import(${url('server/runtime.ts')});const runtime=await startApplication();const sqlite=await import(${url('server/sqlite.ts')});try{sqlite.sqliteConnection().pragma('wal_autocheckpoint=0');sqlite.sqliteConnection().prepare("INSERT INTO app_meta VALUES('synthetic_wal_generation','captured')").run();assert.equal(sqlite.sqliteConnection().pragma('journal_mode',{simple:true}),'wal');assert(fs.statSync(path.join(process.env.DATA_DIR,'family.db-wal')).size>0);assert.equal((await runtime.backupRecovery(${JSON.stringify(request)})).encrypted,true);assert.equal(runtime.state.phase,'ready');assert.equal(sqlite.sqliteConnection().open,true);}finally{await runtime.close();}assert.equal(sqlite.sqliteConnection().open,false);`;
        const captured = await run('source', ['--input-type=module', '--eval', capture]);
        expect(captured.code, captured.output).toBe(0);
        const bytes = fs.readFileSync(file), plain = decryptRecovery(bytes, Buffer.from(key, 'hex'));
        let payload: any;
        try {
            payload = JSON.parse(plain.toString('utf8'));
        }
        finally {
            plain.fill(0);
        }
        const saved = payload.snapshot ?? payload;
        expect(saved.manifest.domains.wallet).toBe(16);
        expect(saved.tables.wallet_investment_trades).toHaveLength(1);
        expect(saved.tables.wallet_import_entries).toHaveLength(2);
        expect(saved.tables.wallet_receipts).toHaveLength(1);
        expect(saved.tables.wallet_user_settings).toHaveLength(1);
        expect(saved.tables.wallet_occurrence_metadata.some((row: any) => row.state === 'confirmed')).toBe(true);
        expect(saved.tables.wallet_account_grants).toHaveLength(1);
        const targetDb = path.join(env('target').DATA_DIR!, 'family.db'), before = fs.readFileSync(targetDb);
        if (tamper) {
            saved.tables.wallet_postings.find((row: any) => row.record_id === saved.tables.wallet_investment_trades[0].id).delta_minor = '-1';
            saved.manifest.checksum = checksum(saved);
            fs.writeFileSync(file, encryptRecovery(Buffer.from(JSON.stringify(payload)), Buffer.from(key, 'hex')));
        }
        const restored = await run('target', [path.join(repo, 'server/operator.ts'), '--restore-recovery'], request);
        if (tamper) {
            expect(restored.code, restored.output).toBe(1);
            expect(restored.output).toContain('RECOVERY_SNAPSHOT_INVALID');
            expect(fs.readFileSync(targetDb)).toEqual(before);
            expect(fs.existsSync(path.join(env('target').DATA_DIR!, 'restore-journal.json'))).toBe(false);
        }
        else {
            expect(restored.code, restored.output).toBe(0);
            const db = new Database(targetDb, { readonly: true });
            try {
                for (const [name, rows] of Object.entries(saved.tables) as [
                    string,
                    any[]
                ][])
                    if (name.startsWith('wallet_')) {
                        const columns = Object.keys(rows[0] ?? {});
                        if (!columns.length) {
                            expect(db.prepare('SELECT count(*) AS n FROM ' + name).get()).toEqual({ n: 0 });
                            continue;
                        }
                        const actual = db.prepare('SELECT ' + columns.map(column => ['opening_minor', 'delta_minor', 'amount_minor', 'limit_minor', 'interest_minor', 'quantity_units', 'price_minor', 'fee_minor', 'credit_limit_minor', 'debit_minor', 'credit_minor'].includes(column) ? 'CAST(' + column + ' AS TEXT) AS ' + column : column).join(',') + ' FROM ' + name).all();
                        const normalized = (values: any[]) => values.map(value => JSON.stringify(Object.fromEntries(Object.entries(value).sort()))).sort();
                        expect(normalized(actual), name).toEqual(normalized(rows));
                    }
                expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
                expect(db.prepare('SELECT count(*) AS n FROM auth_sessions').get()).toEqual({ n: 0 });
                expect(db.prepare("SELECT value FROM app_meta WHERE key='synthetic_wal_generation'").get()).toEqual({ value: 'captured' });
            }
            finally {
                db.close();
            }
            for (const [name, data] of Object.entries(saved.media))
                expect(fs.readFileSync(path.join(env('target').DATA_DIR!, 'uploads', ...name.split('/')))).toEqual(Buffer.from(data as string, 'base64'));
            const restarted = await run('target', ['--input-type=module', '--eval', `import assert from 'node:assert/strict';const {startApplication}=await import(${url('server/runtime.ts')});const runtime=await startApplication();try{assert.equal(runtime.state.phase,'ready');}finally{await runtime.close();}`]);
            expect(restarted.code, restarted.output).toBe(0);
            expect(fs.readFileSync(file)).toEqual(bytes);
        }
        expect(fs.existsSync(attempts) ? fs.readFileSync(attempts, 'utf8') : '').toBe('');
    }
    finally {
        fs.rmSync(root, { recursive: true });
    }
}
it('online WAL encrypted recovery preserves all schema16 Wallet facts receipts grants settings occurrences and trades across an independent installation and restart', () => scenario(false), 60000);
it('rechecksummed and reencrypted broken trade cash is rejected before changing target storage or files', () => scenario(true), 60000);
