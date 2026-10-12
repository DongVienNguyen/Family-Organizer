import { appConfig, prepareStorage, reloadProviderEnvironment, type AppConfig } from './config.js';
import { createApp } from './app.js';
import { AppJobs } from './appJobs.js';
import { drainAppEffects, trackAppEffect } from './appEffects.js';
import { runOnlineRecoveryBackup, RecoveryOperatorError } from './recoveryOperator.js';
import {readBackupConfiguration,registerRecoveryBackupSchedule,RecoveryScheduleError,type BackupHealth} from './recoverySchedule.js';
import {randomUUID,createHash} from 'node:crypto';
import { createSystemMetrics } from './systemMetrics.js';
import { readBuildInfo } from './updater.js';
import { startManagedServer, disposeDrainedResources } from './lifecycle.js';
import type { RuntimeState } from './runtimeState.js';
import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {loadUpdateAttempt,validateUpdateStartup,UpdateFenceError} from './updateFence.js';

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
    const updateAttempt=loadUpdateAttempt(config); // Bind before any SQLite/bootstrap writes.
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
    const {withAppWriteTransaction}=await import('./appStore.js');
    const jobs=new AppJobs(undefined,new AppJobStore());
    const backupRecovery=(value:unknown)=>{
      const assertReady=()=>{if(state.phase!=='ready')throw new RecoveryOperatorError('RECOVERY_RUNTIME_NOT_READY');};
      try{assertReady();}catch(error){return Promise.reject(error);}
      return trackAppEffect(runOnlineRecoveryBackup(value,assertReady));
    };
    let backupHealth:()=>BackupHealth;
    try{
      backupHealth=registerRecoveryBackupSchedule(jobs,readBackupConfiguration(config),{
        readRestoreEpoch(){const row=storage.sqliteConnection().prepare('SELECT id FROM app_restore_commits ORDER BY rowid DESC LIMIT 1').get() as {id:string}|undefined;return row?.id??'initial';},
        capture:async value=>await backupRecovery(value) as import('./recoverySchedule.js').BackupReceipt,
        readState(){const row=storage.sqliteConnection().prepare('SELECT value FROM app_meta WHERE key=?').get('recovery_backup_last_success') as {value:string}|undefined;try{return row?JSON.parse(row.value):null;}catch{throw new RecoveryScheduleError('RECOVERY_BACKUP_STATE_INVALID');}},
        writeState(value){const serialized=JSON.stringify(value);withAppWriteTransaction({actorId:'system:backup-monitor',command:'core:backup:state',requestId:randomUUID(),payloadHash:createHash('sha256').update(serialized).digest('hex')},tx=>tx.run('INSERT OR REPLACE INTO app_meta(key,value) VALUES(?,?)','recovery_backup_last_success',serialized));},
      });
    }catch(error){
      const code=error instanceof RecoveryScheduleError&&error.message==='RECOVERY_BACKUP_STATE_INVALID'?error.message:'RECOVERY_BACKUP_CONFIG_INVALID';
      console.error('Encrypted backup setup failed: '+code);
      backupHealth=()=>({enabled:true,status:'failed',lastSuccessAt:null,ageMs:null,diskFull:false,lastError:code});
    }
    state.migrating = false; state.storageWritable = true;
    handle = await createApp(config, {
      db, sqlite, media, fullBackup, telegram, digest, ics, push,auth,
      build: readBuildInfo(config.codeRoot, process.env), state,
      jobs,backupHealth, metrics: createSystemMetrics(config.dataRoot),
      checkStorage: () => prepareStorage(config),
    });
    const port = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
    delegated = true;
    const managed = await startManagedServer(handle, {
      port,host:'127.0.0.1', state, drainEffects: drainAppEffects,
      closeStorage() { storage.sqliteCheckpoint(); storage.sqliteClose(); },
      validateStartup:updateAttempt ? (server,signal)=>validateUpdateStartup(updateAttempt,server,signal,{
        inspectStorage(){
          const connection=storage.sqliteConnection(),number=(key:string)=>{const row=connection.prepare('SELECT value FROM app_meta WHERE key=?').get(key) as {value:string}|undefined;return row&&/^[1-9][0-9]*$/.test(row.value)?Number(row.value):NaN;};
          const domains=Object.fromEntries((connection.prepare('SELECT namespace, MAX(version) AS version FROM app_migrations GROUP BY namespace').all() as {namespace:string;version:number}[]).map(row=>[row.namespace,row.version]));
          return {integrity:String(connection.pragma('integrity_check',{simple:true})),users:db.FamilyDB.getUsers().length,schemas:{legacy:number('schema_version'),jobs:number('job_store_version'),snapshot:1,domains}};
        },
        markWritesPossible(attempt){
          if(signal.aborted||state.phase!=='starting')throw new UpdateFenceError('UPDATE_STARTUP_CANCELLED');
          const key='update_writes_opened:'+attempt.operationId,record={format:1,operationId:attempt.operationId,manifestSha256:attempt.manifestSha256,writesMayOpen:true},serialized=JSON.stringify(record);
          const existing=storage.sqliteConnection().prepare('SELECT value FROM app_meta WHERE key=?').get(key) as {value:string}|undefined;
          if(existing){try{if(!isDeepStrictEqual(JSON.parse(existing.value),record))throw new Error();}catch{throw new UpdateFenceError('UPDATE_BINDING_INVALID');}}
          withAppWriteTransaction({actorId:'system:update-validation',command:'core:update:open-writes',requestId:attempt.operationId,payloadHash:createHash('sha256').update(serialized).digest('hex')},tx=>{tx.run('INSERT OR IGNORE INTO app_meta(key,value) VALUES(?,?)',key,serialized);return {writesMayOpen:true};});
          // Cached command results are not sufficient evidence if metadata was damaged.
          const durable=storage.sqliteConnection().prepare('SELECT value FROM app_meta WHERE key=?').get(key) as {value:string}|undefined;
          try{if(!durable||!isDeepStrictEqual(JSON.parse(durable.value),record))throw new Error();}catch{throw new UpdateFenceError('UPDATE_STORAGE_FAILED');}
        },
      }) : undefined,
    });
    return Object.assign(managed, {
      backupRecovery,backupHealth,
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
