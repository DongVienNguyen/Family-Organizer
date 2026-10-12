import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('native storage roots', () => {
  let fixture: string;
  let openedStore: typeof import('./sqlite.js') | undefined;
  const originalCwd = process.cwd();
  beforeEach(() => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'fo roots tiếng Việt '));
    vi.stubEnv('DATA_DIR', path.join(fixture, 'dữ liệu gia đình'));
    vi.resetModules();
    openedStore = undefined;
  });
  afterEach(async () => {
    openedStore?.sqliteClose();
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  it('opens the explicitly selected SQLite database rather than a database beside the current directory', async () => {
    const foreignCwd = path.join(fixture, 'arbitrary cwd');
    fs.mkdirSync(foreignCwd);
    process.chdir(foreignCwd);
    const store = await import('./sqlite.js');
    openedStore = store;
    store.sqliteSave({ tasks: [{ id: 'preserved-id', title: 'Synthetic' }] } as any);
    expect(fs.existsSync(path.join(process.env.DATA_DIR!, 'family.db'))).toBe(true);
    expect(store.sqliteLoad().tasks[0].id).toBe('preserved-id');
    store.sqliteClose();
  });

  it('resolves default development data from codeRoot, independently of cwd', async () => {
    const { resolveConfig } = await import('./config.js');
    const codeRoot = path.join(fixture, 'code');
    const config = resolveConfig({}, codeRoot);
    expect(config).toMatchObject({ codeRoot, dataRoot: path.join(codeRoot, 'data'), configRoot: path.join(codeRoot, 'data'), logRoot: path.join(codeRoot, 'data', 'logs') });
  });

  it('imports the selected legacy JSON fixture and keeps its IDs/session/settings/media', async () => {
    const data = process.env.DATA_DIR!;
    fs.mkdirSync(path.join(data, 'uploads'), { recursive: true });
    const snapshot = { users: [{ id: 'legacy-user', username: 'synthetic', role: 'admin' }], tasks: [{ id: 'legacy-task', title: 'Cũ' }] };
    fs.writeFileSync(path.join(data, 'db.json'), JSON.stringify(snapshot));
    fs.writeFileSync(path.join(data, 'session_secret.key'), 'synthetic-secret');
    fs.writeFileSync(path.join(data, 'app_settings.json'), JSON.stringify({ marker: 'synthetic' }));
    fs.writeFileSync(path.join(data, 'uploads', 'old.bin'), 'synthetic-media');
    const { FamilyDB, getSessionSecret, getAppSettings } = await import('./db.js');
    openedStore = await import('./sqlite.js');
    expect(FamilyDB.getFullSnapshot()).toMatchObject(snapshot);
    expect(getSessionSecret()).toBe('synthetic-secret');
    expect(getAppSettings()).toEqual({ marker: 'synthetic' });
    expect(fs.readFileSync(path.join(data, 'uploads', 'old.bin'), 'utf8')).toBe('synthetic-media');
    expect(JSON.parse(fs.readFileSync(path.join(data, 'db.json'), 'utf8'))).toEqual(snapshot);
  });

  it('refuses a corrupt selected legacy JSON database without silently seeding a new family', async () => {
    const data = process.env.DATA_DIR!;
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, 'db.json'), 'broken synthetic JSON');
    openedStore = await import('./sqlite.js');
    await expect(import('./db.js')).rejects.toThrow(/db.json/);
    expect(openedStore.sqliteLoad().users).toEqual([]);
    expect(fs.readFileSync(path.join(data, 'db.json'), 'utf8')).toBe('broken synthetic JSON');
  });

  it('keeps Unicode/spaces and separates code, config and logs', async () => {
    const { resolveConfig } = await import('./config.js');
    const dataRoot = path.join(fixture, 'dữ liệu gia đình');
    const configRoot = path.join(fixture, 'cấu hình');
    const logRoot = path.join(fixture, 'log files');
    expect(resolveConfig({ NODE_ENV: 'production', DATA_DIR: dataRoot, CONFIG_DIR: configRoot, LOG_DIR: logRoot }, path.join(fixture, 'release'))).toMatchObject({ dataRoot, configRoot, logRoot });
  });

  it('loads provider settings from explicit configRoot while refusing dotenv changes to launch roots or NODE_ENV', async () => {
    vi.stubEnv('NODE_ENV', undefined);
    vi.stubEnv('APP_URL', undefined);
    const data = process.env.DATA_DIR!;
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, '.env'), 'NODE_ENV=production\nCONFIG_DIR=relative\nAPP_URL=https://synthetic.invalid\n');
    const { appConfig } = await import('./config.js');
    expect(appConfig.dataRoot).toBe(data);
    expect(process.env.NODE_ENV).toBeUndefined();
    expect(process.env.CONFIG_DIR).toBeUndefined();
    expect(process.env.APP_URL).toBe('https://synthetic.invalid');
  });

  it.each(['data', 'C:relative', ''])('rejects nonabsolute DATA_DIR %j in production', async value => {
    const { resolveConfig } = await import('./config.js');
    expect(() => resolveConfig({ NODE_ENV: 'production', DATA_DIR: value }, path.join(fixture, 'release'))).toThrow(/DATA_DIR.*absolute|required/);
  });

  it('rejects production storage inside the release directory', async () => {
    const { resolveConfig } = await import('./config.js');
    const codeRoot = path.join(fixture, 'release');
    expect(() => resolveConfig({ NODE_ENV: 'production', DATA_DIR: path.join(codeRoot, 'data') }, codeRoot)).toThrow(/outside.*codeRoot/);
  });

  it.each(['DATA_DIR', 'CONFIG_DIR', 'LOG_DIR', 'APP_CODE_ROOT'])('rejects a non-fully-qualified %s', async name => {
    const { resolveConfig } = await import('./config.js');
    expect(() => resolveConfig({ [name]: '\\data' }, fixture)).toThrow(/absolute|qualified/);
    expect(() => resolveConfig({ [name]: process.platform === 'win32' ? '/data' : 'relative' }, fixture)).toThrow(/absolute|qualified/);
  });

  it('fails storage initialization without falling back when a selected directory cannot be written', async () => {
    const { resolveConfig, prepareStorage } = await import('./config.js');
    const obstruction = path.join(fixture, 'file-not-directory');
    fs.writeFileSync(obstruction, 'preserve me');
    const config = resolveConfig({ DATA_DIR: path.join(obstruction, 'data') }, fixture);
    expect(() => prepareStorage(config)).toThrow(/writable/);
    expect(fs.readFileSync(obstruction, 'utf8')).toBe('preserve me');
    expect(fs.existsSync(path.join(fixture, 'data'))).toBe(false);
  });
});

describe('provider environment after restore recovery',()=>{
 it('reloads replaced provider values, clears selected removals, and keeps explicit host overrides',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo recovered provider env '));
  vi.stubEnv('DATA_DIR',root);vi.stubEnv('CONFIG_DIR',root);vi.stubEnv('GEMINI_API_KEY',undefined);vi.stubEnv('API_KEY',undefined);vi.stubEnv('VAPID_PUBLIC_KEY','synthetic-host-public');vi.stubEnv('VAPID_PRIVATE_KEY',undefined);vi.stubEnv('VAPID_SUBJECT',undefined);vi.resetModules();
  try{const file=path.join(root,'.env');fs.writeFileSync(file,'GEMINI_API_KEY=synthetic-before\nAPI_KEY=synthetic-remove\nVAPID_PUBLIC_KEY=synthetic-before-public\nVAPID_PRIVATE_KEY=synthetic-before-private\n');const config=await import('./config.js');expect(process.env.GEMINI_API_KEY).toBe('synthetic-before');fs.writeFileSync(file,'GEMINI_API_KEY=synthetic-after\nVAPID_PUBLIC_KEY=synthetic-after-public\nVAPID_PRIVATE_KEY=synthetic-after-private\nVAPID_SUBJECT=mailto:synthetic@example.invalid\n');config.reloadProviderEnvironment();expect(process.env.GEMINI_API_KEY).toBe('synthetic-after');expect(process.env.API_KEY).toBeUndefined();expect(process.env.VAPID_PUBLIC_KEY).toBe('synthetic-host-public');expect(process.env.VAPID_PRIVATE_KEY).toBe('synthetic-after-private');expect(process.env.VAPID_SUBJECT).toBe('mailto:synthetic@example.invalid');}
  finally{vi.unstubAllEnvs();vi.resetModules();fs.rmSync(root,{recursive:true,force:true});}
 });
});
it('preserves a mixed-case host provider variable using the actual platform environment semantics',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fo mixed host env '));vi.stubEnv('DATA_DIR',root);vi.stubEnv('CONFIG_DIR',root);vi.stubEnv('gemini_api_key','synthetic-mixed-host');if(process.platform!=='win32')vi.stubEnv('GEMINI_API_KEY',undefined);vi.resetModules();
 try{const file=path.join(root,'.env');fs.writeFileSync(file,'GEMINI_API_KEY=synthetic-file-before\n');const config=await import('./config.js');fs.writeFileSync(file,'GEMINI_API_KEY=synthetic-file-after\n');config.reloadProviderEnvironment();expect(process.env.GEMINI_API_KEY).toBe(process.platform==='win32'?'synthetic-mixed-host':'synthetic-file-after');expect(process.env.gemini_api_key).toBe('synthetic-mixed-host');}
 finally{vi.unstubAllEnvs();vi.resetModules();fs.rmSync(root,{recursive:true,force:true});}
});
