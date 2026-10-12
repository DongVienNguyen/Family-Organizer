import { appConfig, prepareStorage, reloadProviderEnvironment, type AppConfig } from './config.js';
import { createApp } from './app.js';
import { AppJobs } from './appJobs.js';
import { drainAppEffects, trackAppEffect } from './appEffects.js';
import { runOnlineRecoveryBackup, RecoveryOperatorError } from './recoveryOperator.js';
import { createSystemMetrics } from './systemMetrics.js';
import { readBuildInfo } from './updater.js';
import { startManagedServer, disposeDrainedResources } from './lifecycle.js';
import type { RuntimeState } from './runtimeState.js';
import fs from 'node:fs';
import path from 'node:path';

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
    if(!fs.existsSync(path.join(config.dataRoot,'family.db'))&&!fs.existsSync(path.join(config.dataRoot,'db.json'))){
      throw new Error('Installation initialization is required; use the trusted local operator command.');
    }
    sqlite = await import('./sqlite.js');
    const storage = sqlite;
    const { recoverAppRestore } = await import('./appSnapshot.js');
    recoverAppRestore();
    reloadProviderEnvironment(); // Recovered .env precedes db -> push/provider module evaluation.
    const db = await import('./db.js');
    const {createAuth}=await import('./auth.js');const {NativeSessionStore}=await import('./authStore.js');
    const auth=createAuth({store:new NativeSessionStore(),getUsers:()=>db.FamilyDB.getUsers(),getSecret:db.getSessionSecret});
    auth.initialize(); // Validate and persist key rotation before readiness, even without auth traffic.
    const media = await import('./media.js');
    media.initializeMediaMetadata();
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
    const managed = await startManagedServer(handle, {
      port,host:'127.0.0.1', state, drainEffects: drainAppEffects,
      closeStorage() { storage.sqliteCheckpoint(); storage.sqliteClose(); },
    });
    return Object.assign(managed, {
      backupRecovery(value:unknown) {
        const assertReady=()=>{if(state.phase!=='ready')throw new RecoveryOperatorError('RECOVERY_RUNTIME_NOT_READY');};
        try { assertReady(); }
        catch(error) { return Promise.reject(error); }
        return trackAppEffect(runOnlineRecoveryBackup(value,assertReady));
      },
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
