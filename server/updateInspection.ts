import fs from 'node:fs';
import Database from 'better-sqlite3';
import {assertNoLinkedAncestors} from '../scripts/lib/native-paths.mjs';
import {assertSchemaCompatibility,UpdateFenceError,type StoredUpdateSchemas} from './updateFence.js';
/** Offline inspection uses the actual database without bootstrap/migration writes. */
export function inspectUpdateStorage(file:string,operationId:unknown,schema:unknown){
 if(typeof operationId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(operationId))throw new UpdateFenceError('UPDATE_CONTROL_INVALID');
 let connection:Database.Database|undefined;
 try{
  assertNoLinkedAncestors(file);const stat=fs.lstatSync(file);if(!stat.isFile()||stat.nlink!==1)throw new Error();
  connection=new Database(file,{readonly:true,fileMustExist:true});
  const number=(key:string)=>{const row=connection!.prepare('SELECT value FROM app_meta WHERE key=?').get(key)as {value:string}|undefined;return row&&/^\d+$/.test(row.value)?Number(row.value):NaN;};
  const domains=Object.fromEntries((connection.prepare('SELECT namespace, MAX(version) AS version FROM app_migrations GROUP BY namespace').all()as {namespace:string;version:number}[]).map(row=>[row.namespace,row.version]));
  const schemas:StoredUpdateSchemas={legacy:number('schema_version'),jobs:number('job_store_version'),snapshot:1,domains};assertSchemaCompatibility(schema,schemas);
  const integrity=String(connection.pragma('integrity_check',{simple:true})),users=(connection.prepare('SELECT COUNT(*) AS total FROM users').get()as {total:number}).total;
  if(integrity!=='ok'||!Number.isSafeInteger(users)||users<1)throw new Error();
  const openedMetadata=!!connection.prepare('SELECT 1 FROM app_meta WHERE key=?').get('update_writes_opened:'+operationId),openedCommands=(connection.prepare('SELECT COUNT(*) AS total FROM app_commands WHERE command=? AND request_id=?').get('core:update:open-writes',operationId)as {total:number}).total;
  return {integrity,users,schemas,writesMayHaveOpened:openedMetadata||openedCommands>0,openedMetadata,openedCommands};
 }catch(error){if(error instanceof UpdateFenceError)throw error;throw new UpdateFenceError('UPDATE_STORAGE_FAILED');}finally{connection?.close();}
}
