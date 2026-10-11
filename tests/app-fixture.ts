import http from 'node:http';
import { AppJobs } from '../server/appJobs.js';
import { createSystemMetrics } from '../server/systemMetrics.js';
export function syntheticDependencies(state: any) {
  return {
    state, jobs: new AppJobs(), metrics: createSystemMetrics(process.env.DATA_DIR!),
    db: { getSessionSecret: () => 'synthetic-key', getAppSettings: () => ({}), FamilyDB: { getUsers: () => [], getPushSubscriptions: () => [], getBackups: () => [], createBackup: () => {}, generateReminders: () => {}, generateBirthdayNotifications: () => {} } },
    sqlite: {}, media: { UPLOADS_DIR: process.env.DATA_DIR! }, fullBackup: {}, telegram: {}, digest: {}, ics: {}, push: {},
    build: { version: 'synthetic', commit: '', buildTime: '' },
  } as any;
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
