import { appConfig, prepareStorage, type AppConfig } from './config.js';
import { createApp } from './app.js';
import { AppJobs } from './appJobs.js';
import { drainAppEffects } from './appEffects.js';
import { createSystemMetrics } from './systemMetrics.js';
import { readBuildInfo } from './updater.js';
import { startManagedServer, disposeDrainedResources } from './lifecycle.js';
import type { RuntimeState } from './runtimeState.js';

/** The legacy store is one installation per process; it is loaded explicitly here. */
let applicationClaimed = false;
export async function startApplication(config: AppConfig = appConfig) {
  // Cached legacy modules hold one connection. Restart after stop/failure uses a
  // fresh process, so another launch can never dispose this process's owner.
  if (applicationClaimed) throw new Error('Application already started; restart in a fresh process');
  applicationClaimed = true;
  const state: RuntimeState = { phase: 'starting', storageWritable: false, migrating: true };
  prepareStorage(config);
  for (const key of ['codeRoot', 'dataRoot', 'configRoot', 'logRoot'] as const) {
    if (config[key] !== appConfig[key]) throw new Error('Storage roots must match the launch configuration');
  }
  let sqlite: typeof import('./sqlite.js') | undefined;
  let handle: Awaited<ReturnType<typeof createApp>> | undefined;
  let delegated = false;
  try {
    sqlite = await import('./sqlite.js');
    const storage = sqlite;
    const { recoverAppRestore } = await import('./appSnapshot.js');
    recoverAppRestore();
    const db = await import('./db.js');
    const {createAuth}=await import('./auth.js');const {NativeSessionStore}=await import('./authStore.js');
    db.getSessionSecret(); // Fail startup before readiness on inaccessible/invalid key.
    const auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:db.getSessionSecret});
    const media = await import('./media.js');
    const fullBackup = await import('./fullBackup.js');
    const telegram = await import('./telegramBackup.js');
    const digest = await import('./weeklyDigest.js');
    const ics = await import('./icsFeed.js');
    const push = await import('./push.js');
    const { AppJobStore } = await import('./jobStore.js');
    state.migrating = false; state.storageWritable = true;
    handle = await createApp(config, {
      db, sqlite, media, fullBackup, telegram, digest, ics, push,auth,
      build: readBuildInfo(config.codeRoot, process.env), state,
      jobs: new AppJobs(undefined, new AppJobStore()), metrics: createSystemMetrics(config.dataRoot),
      checkStorage: () => prepareStorage(config),
    });
    const port = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
    delegated = true;
    return await startManagedServer(handle, {
      port,host:'127.0.0.1', state, drainEffects: drainAppEffects,
      closeStorage() { storage.sqliteCheckpoint(); storage.sqliteClose(); },
    });
  } catch (error) {
    state.phase = 'failed';
    if (!delegated) {
      await handle?.jobs.stop();
      await drainAppEffects();
      await disposeDrainedResources(async () => { await handle?.dispose(); }, () => sqlite?.sqliteClose());
    }
    throw error;
  }
}
