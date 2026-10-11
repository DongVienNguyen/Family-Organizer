import fs from 'node:fs';
import path from 'node:path';
import { describe,it,expect } from 'vitest';
import * as updater from './updater.js';
describe('operator-managed build metadata',()=>{
  const read = (...args: any[]) => { expect((updater as any).readBuildInfo).toBeTypeOf('function'); return (updater as any).readBuildInfo(...args); };
  it('reads the selected installation version without creating an update mailbox',()=>{
    const root=process.env.DATA_DIR!; fs.mkdirSync(root,{recursive:true}); fs.writeFileSync(path.join(root,'package.json'),'{"version":"1.2.3"}');
    expect(read(root,{})).toEqual({version:'1.2.3',commit:'',buildTime:''}); expect(fs.existsSync(path.join(root,'update'))).toBe(false);
  });
  it('uses validated release version/build identity when explicitly supplied',()=>{
    expect(read(process.cwd(),{APP_VERSION:'v2.3.4',GIT_SHA:'a'.repeat(40),BUILD_TIME:'2026-10-11T00:00:00Z'})).toMatchObject({version:'2.3.4',commit:'a'.repeat(40)});
  });
  it.each(['../target','1.2','not-a-version'])('refuses malformed build version %s',value=>{expect(()=>read(process.cwd(),{APP_VERSION:value})).toThrow(/version/i);});
  it('refuses missing installation metadata instead of reporting a fake version',()=>{expect(()=>read(process.env.DATA_DIR!+'/missing',{})).toThrow();});
  it('retains numeric semver comparison',()=>{expect(updater.compareVersions('1.10.0','1.9.0')).toBeGreaterThan(0);expect(updater.compareVersions('v2.0.0','2.0.0')).toBe(0);expect(updater.compareVersions('1.0.0','1.0.1')).toBeLessThan(0);});
  it('retains readonly parsing of historical migration input',()=>{expect(updater.parseEnv('a=1\r\nmessage=x=y\n\nbad line\n')).toEqual({a:'1',message:'x=y'});});
  it('exports no app/Immich apply, restart, schedule or mailbox writer',()=>{
    for(const name of ['startUpdate','requestRestart','setAutoUpdate','startImmichUpdate','runUpdateTick','checkImmichRelease']) expect((updater as any)[name],name).toBeUndefined();
  });
});
