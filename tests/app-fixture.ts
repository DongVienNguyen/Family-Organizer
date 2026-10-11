import http from 'node:http';
import { AppJobs } from '../server/appJobs.js';
import { createSystemMetrics } from '../server/systemMetrics.js';
import { createAuth,type SessionRecord } from '../server/auth.js';
export function syntheticDependencies(state: any) {
  const dependencies:any={
    state, jobs: new AppJobs(), metrics: createSystemMetrics(process.env.DATA_DIR!),
    db: { getSessionSecret: () => 'synthetic-key', getAppSettings: () => ({}), FamilyDB: { getUsers: () => [], getPushSubscriptions: () => [], getBackups: () => [], createBackup: () => {}, generateReminders: () => {}, generateBirthdayNotifications: () => {} } },
    sqlite: {}, media: { UPLOADS_DIR: process.env.DATA_DIR! }, fullBackup: {}, telegram: {}, digest: {}, ics: {}, push: {},
    build: { version: 'synthetic', commit: '', buildTime: '' },
  };
  const records=new Map<string,SessionRecord>();let key='',generation=0;
  dependencies.auth=createAuth({getUsers:()=>dependencies.db.FamilyDB.getUsers(),getSecret:()=>dependencies.db.getSessionSecret(),store:{get:hash=>records.get(hash),insert:row=>{records.set(row.tokenHash,{...row});},version:()=>0,keyVersion:fingerprint=>{if(key!==fingerprint){key=fingerprint;generation++;records.clear();}return String(generation);},revoke:(hash,time)=>{const row=records.get(hash);if(row)row.revokedAt=time;}}});
  return dependencies;
}
export function request(server: http.Server, pathname: string, method = 'GET'): Promise<{ status: number; body: any }> {
  const address = server.address() as any;
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: address.port, path: pathname, method, agent: false }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(text) }));
    }); req.on('error', reject); req.end();
  });
}
