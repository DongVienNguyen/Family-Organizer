/** @license SPDX-License-Identifier: Apache-2.0 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import {TextDecoder} from 'node:util';
import {runRecoveryOperator,RecoveryOperatorError} from './recoveryOperator.js';
import {maintainRecoveryBackups,RecoveryRetentionError} from './recoveryRetention.js';
import {RecoveryEnvelopeError} from './recoveryEnvelope.js';
import { createInitialData } from './initialData.js';
import { hashPassword,MAX_PASSWORD_BYTES } from './passwords.js';
import { UserRole } from '../src/types.js';
import {requestFirstAccountStorage,InstallationNotPristineError} from './installationMode.js';

class OperatorError extends Error {}
function refuse(code:string):never{throw new OperatorError(code);}
function readInput():Promise<unknown>{
  const timeout=process.env.FIRST_ADMIN_INPUT_TIMEOUT_MS===undefined?20000:Number(process.env.FIRST_ADMIN_INPUT_TIMEOUT_MS);
  if(!Number.isSafeInteger(timeout)||timeout<50||timeout>20000)refuse('INITIALIZATION_CONFIGURATION_INVALID');
  return new Promise((resolve,reject)=>{
    const chunks:Buffer[]=[];let size=0,settled=false;
    const cleanup=()=>{clearTimeout(deadline);process.stdin.off('data',data);process.stdin.off('end',end);process.stdin.off('error',failed);process.stdin.pause();};
    const failed=(error:Error)=>{if(settled)return;settled=true;cleanup();reject(error);};
    const data=(chunk:Buffer)=>{size+=chunk.length;if(size>16384){failed(new OperatorError('INITIALIZATION_INPUT_LIMIT'));return;}chunks.push(chunk);};
    const end=()=>{if(settled)return;let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{failed(new OperatorError('INITIALIZATION_INPUT_INVALID'));return;}settled=true;cleanup();resolve(value);};
    const deadline=setTimeout(()=>failed(new OperatorError('INITIALIZATION_INPUT_TIMEOUT')),timeout);
    process.stdin.on('data',data);process.stdin.once('end',end);process.stdin.once('error',failed);
  });
}
function identity(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))refuse('INITIALIZATION_INPUT_INVALID');
  const input=value as Record<string,unknown>;
  if(Object.keys(input).some(key=>!['username','fullName','password'].includes(key))||typeof input.username!=='string'||typeof input.fullName!=='string'||typeof input.password!=='string')refuse('INITIALIZATION_INPUT_INVALID');
  const username=input.username.trim().toLowerCase(),fullName=input.fullName.trim(),password=input.password;
  if(!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(username)||!fullName||fullName.length>256||password.trim().length<16||password.length>MAX_PASSWORD_BYTES||Buffer.byteLength(password,'utf8')>MAX_PASSWORD_BYTES)refuse('INITIALIZATION_INPUT_INVALID');
  return {username,fullName,password};
}
async function main(){
  const recovery=process.argv.length===3&&['--backup-recovery','--restore-recovery'].includes(process.argv[2]);
  const maintenance=process.argv.length===3&&['--copy-recovery','--prune-recovery'].includes(process.argv[2]);
  const reset=process.argv.length===3&&process.argv[2]==='--reset-credentials';
  if((process.argv.length!==2&&!reset&&!recovery&&!maintenance)||process.env.NODE_ENV!=='production')refuse('INITIALIZATION_CONFIGURATION_INVALID');
  if(maintenance){const {appConfig}=await import('./config.js');process.stdout.write(JSON.stringify(await maintainRecoveryBackups(await readInput(),appConfig,process.argv[2]==='--prune-recovery'))+'\n');return;}
  if(recovery){process.stdout.write(JSON.stringify(await runRecoveryOperator(await readInput(),process.argv[2]==='--restore-recovery'))+'\n');return;}
  if(reset){
    const input=await readInput();
    const {appConfig}=await import('./config.js');
    if(!fs.existsSync(path.join(appConfig.dataRoot,'family.db')))refuse('CREDENTIAL_REENTRY_STORE_REQUIRED');
    const sqlite=await import('./sqlite.js');
    try{
      const {reenterCredentials,CredentialResetError}=await import('./credentialReset.js');
      let result;
      try{result=reenterCredentials(input);}catch(error){if(error instanceof CredentialResetError)refuse(error.message);throw error;}
      sqlite.sqliteCheckpoint();process.stdout.write(JSON.stringify(result)+'\n');
    }finally{sqlite.sqliteClose();}
    return;
  }
  const admin=identity(await readInput());
  const {appConfig,prepareStorage}=await import('./config.js');
  prepareStorage(appConfig);
  const legacyFile=path.join(appConfig.dataRoot,'db.json');
  if(fs.existsSync(legacyFile))refuse('LEGACY_DATA_PRESENT');
  requestFirstAccountStorage();
  const sqlite=await import('./sqlite.js');
  try{
    if(!sqlite.sqliteInstallationPristine())refuse('INSTALLATION_NOT_PRISTINE');
    const {withAppWriteTransaction}=await import('./appStore.js');
    const user={id:'user_admin',username:admin.username,fullName:admin.fullName,role:UserRole.ADMIN,avatarColor:'bg-red-500',passwordHash:hashPassword(admin.password),createdAt:new Date().toISOString()};
    const result=withAppWriteTransaction({actorId:'operator:first-admin',command:'operator:initialize',requestId:randomUUID(),payloadHash:createHash('sha256').update(JSON.stringify(user)).digest('hex')},tx=>{
      if(fs.existsSync(legacyFile))refuse('LEGACY_DATA_PRESENT');
      if(!sqlite.sqliteInstallationPristine())refuse('INSTALLATION_NOT_PRISTINE');
      Object.assign(tx.legacy,createInitialData(user));
      return {initialized:true,username:user.username};
    });
    sqlite.sqliteCheckpoint();process.stdout.write(JSON.stringify(result)+'\n');
  }finally{sqlite.sqliteClose();}
}
main().catch(error=>{process.exitCode=1;process.stdout.write(JSON.stringify({error:error instanceof OperatorError||error instanceof InstallationNotPristineError||error instanceof RecoveryOperatorError||error instanceof RecoveryEnvelopeError||error instanceof RecoveryRetentionError?error.message:'INITIALIZATION_STORAGE_FAILED'})+'\n');}).finally(()=>{process.stdin.destroy();});
