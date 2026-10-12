import fs from 'node:fs';
import Database from 'better-sqlite3';
import {assertNoLinkedAncestors} from '../scripts/lib/native-paths.mjs';
import {assertSchemaCompatibility,openedUpdateBindingVerified,UpdateFenceError,type StoredUpdateSchemas} from './updateFence.js';
/** Offline inspection uses the actual database without bootstrap/migration writes. */
export function inspectUpdateStorage(file:string,operationId:unknown,schema:unknown,manifestSha256?:unknown){
 if(typeof operationId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(operationId))throw new UpdateFenceError('UPDATE_CONTROL_INVALID');
 let connection:Database.Database|undefined;
 try{
  assertNoLinkedAncestors(file);const stat=fs.lstatSync(file);if(!stat.isFile()||stat.nlink!==1)throw new Error();
  connection=new Database(file,{readonly:true,fileMustExist:true});
  const number=(key:string)=>{const row=connection!.prepare('SELECT value FROM app_meta WHERE key=?').get(key)as {value:string}|undefined;return row&&/^[1-9][0-9]*$/.test(row.value)?Number(row.value):NaN;};
  const domains=Object.fromEntries((connection.prepare('SELECT namespace, MAX(version) AS version FROM app_migrations GROUP BY namespace').all()as {namespace:string;version:number}[]).map(row=>[row.namespace,row.version]));
  const schemas:StoredUpdateSchemas={legacy:number('schema_version'),jobs:number('job_store_version'),snapshot:number('snapshot_schema_version'),domains};assertSchemaCompatibility(schema,schemas);
  const integrity=String(connection.pragma('integrity_check',{simple:true})),users=(connection.prepare('SELECT COUNT(*) AS total FROM users').get()as {total:number}).total;
  if(integrity!=='ok'||!Number.isSafeInteger(users)||users<1)throw new Error();
  const metadata=connection.prepare('SELECT value FROM app_meta WHERE key=?').get('update_writes_opened:'+operationId)as {value:string}|undefined,commands=connection.prepare('SELECT * FROM app_commands WHERE command=? AND request_id=?').all('core:update:open-writes',operationId),openedMetadata=!!metadata,openedCommands=commands.length;
  return {integrity,users,schemas,writesMayHaveOpened:openedMetadata||openedCommands>0,openedMetadata,openedCommands,openedBindingVerified:openedUpdateBindingVerified(metadata?.value,commands,operationId,manifestSha256),...(typeof manifestSha256==='string'?{boundManifestSha256:manifestSha256}:{})};
 }catch(error){if(error instanceof UpdateFenceError)throw error;throw new UpdateFenceError('UPDATE_STORAGE_FAILED');}finally{connection?.close();}
}
