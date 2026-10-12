import Database from 'better-sqlite3';
import { snapshotCoreTables, validateSnapshotPayload } from './snapshotValidation.js';
/** Read-only compatibility context; missing runtime tables describe their supported
 * bootstrap schema without creating them in an un-warmed first-account target. */
export function inspectRecoverySnapshot(input:unknown,file:string):void {
 const db=new Database(file,{readonly:true,fileMustExist:true});
 try{
  const names=new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(row=>row.name));
  if(!names.has('app_meta')||(db.prepare("SELECT value FROM app_meta WHERE key='schema_version'").get() as any)?.value!=='1')throw new Error('Unsupported recovery target');
  for(const key of ['job_store_version','snapshot_schema_version']){const row=db.prepare('SELECT value FROM app_meta WHERE key=?').get(key) as any;if(row&&row.value!=='1')throw new Error('Unsupported recovery target');}
  if([...names].some(name=>name.startsWith('wallet_')||name.startsWith('productivity_')))throw new Error('Unregistered domain snapshot tables');
  const primaryKeys=new Map<string,readonly string[]>();
  const defaults:Record<string,readonly string[]>={app_meta:['key'],app_commands:['command','request_id'],app_migrations:['namespace','version'],app_reward_claims:['claim_id'],app_jobs:['id'],server_metrics:['t']};
  for(const [name,columns] of snapshotCoreTables){
   if(!names.has(name)){primaryKeys.set(name,defaults[name]);continue;}
   const info=db.prepare(`PRAGMA table_info(${name})`).all() as any[];
   if(JSON.stringify(info.map(row=>row.name))!==JSON.stringify(columns))throw new Error('Unsupported recovery target');
   primaryKeys.set(name,info.filter(row=>row.pk).sort((a,b)=>a.pk-b.pk).map(row=>row.name));
  }
  const migrations=names.has('app_migrations')?db.prepare('SELECT namespace,version,checksum FROM app_migrations').all() as any[]:[];
  const versions:Record<string,number>={wallet:0,productivity:0};for(const row of migrations)versions[row.namespace]=Math.max(versions[row.namespace]??0,row.version);
  const snapshot=validateSnapshotPayload(input,{tables:snapshotCoreTables,primaryKeys,migrations,versions});
  if(snapshot.manifest.credentials!==undefined)throw new Error('Recovery requires the raw credential snapshot');
 }finally{db.close();}
}
