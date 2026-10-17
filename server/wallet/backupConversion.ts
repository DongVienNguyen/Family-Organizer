import {walletReceiptChecksum} from './receiptSchema.js';
import {createHash} from 'node:crypto';
import {UserRole} from '../../src/types.js';
import {buildLegacyMigrationPlan} from './migrationPlan.js';
import type {LegacyMigrationReceipt} from './migrate.js';
import {legacyFinanceSource} from './legacyMigrationData.js';
import type {AppSnapshot,ValidatedAppSnapshot} from '../snapshotValidation.js';
import {checksum} from '../snapshotValidation.js';
import {walletCoreChecksum,walletMetadataChecksum,walletFinancialChecksum,walletLegacyMigrationChecksum} from './schema.js';
import {validate,walletSnapshotChecksum,walletTablesAt,type WalletSnapshot} from './snapshot.js';
import {walletMetadataColumns} from './metadata.js';
import {walletMetadataParents} from './metadataSchema.js';
/** Explicit offline conversion only; normal restore remains version-exact.
 * Missing historical facts remain unknown, and financial validation refuses
 * transfers whose original quote cannot be recovered from the source bytes. */
export function convertWalletBackup(value:unknown,userIds:Set<string>,targetVersion:4|5=4):WalletSnapshot {
 if(![4,5].includes(targetVersion))throw Error('Unsupported Wallet backup target');validate(value,userIds);const source=structuredClone(value);if(source.schemaVersion>targetVersion+1)throw Error('Wallet backup downgrade is unsupported');if(source.schemaVersion===targetVersion+1)return source;
 const tables=Object.fromEntries(Object.keys(walletTablesAt(targetVersion)).map(name=>[name,source.tables[name]??[]]));
 if(source.schemaVersion===2){
  const provenance={created_at:null,updated_at:null,created_by:null,updated_by:null};
  for(const [name,parent]of Object.entries(walletMetadataParents)){
   const table=name as keyof typeof walletMetadataColumns,columns=walletMetadataColumns[table];
   const defaults=table==='wallet_account_metadata'?{...provenance,excluded_from_stats:0,credit_limit_minor:null,due_day:null,balance_display:'book'}:table==='wallet_record_metadata'?{...provenance,occurred_at:null,payee:'',payment_method:'',reviewed_at:null}:table==='wallet_audit_metadata'?{occurred_at:null,before_json:null,after_json:null}:{...provenance,icon:'',color:'',hidden:0,revision:1};
   tables[table]=tables[parent].map(row=>({[columns[0]]:row.id,...defaults}));
  }
 }
 const result={schemaVersion:targetVersion+1,tables,checksum:''};result.checksum=walletSnapshotChecksum(result);validate(result,userIds);return result;
}

interface ConversionPorts {installedVersion:number;migrations:{version:number;checksum:string;applied_at:string}[];inspectHistorical:(value:unknown,source:{namespace:'wallet'|'productivity';version:number;tables:readonly string[]})=>AppSnapshot;validateTarget:(value:unknown)=>ValidatedAppSnapshot}
function timestamp(value:string){if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw Error('Invalid explicit backup conversion time');}
/** Host binds trusted I01 inspection/validation and installed migration records.
 * Raw legacy JSON/ZIP and other namespace upgrades need separate converters.
 * This returns converted bytes only; the caller still owns restore/maintenance. */
export function convertSharedWalletBackup(input:unknown,ports:ConversionPorts,at:string,legacy?:{ownerUserId:string;timezone:string}):{snapshot:ValidatedAppSnapshot;conversion:{fromVersion:number;toVersion:4|5;sourceChecksum:string;resultChecksum:string;at:string;converted:boolean;migration?:LegacyMigrationReceipt}} {
 timestamp(at);const hashes=[walletCoreChecksum,walletMetadataChecksum,walletFinancialChecksum,walletLegacyMigrationChecksum,walletReceiptChecksum],targetVersion=ports.installedVersion;
 if(targetVersion!==4&&targetVersion!==5)throw Error('Unsupported installed Wallet conversion target');
 if(ports.migrations.length!==targetVersion||ports.migrations.some((row,i)=>row.version!==i+1||row.checksum!==hashes[i]))throw Error('Wallet backup conversion requires the installed trusted migration chain');for(const row of ports.migrations)timestamp(row.applied_at);
 const version=(input as AppSnapshot)?.manifest?.domains?.wallet;if(!Number.isInteger(version)||version<0||version>targetVersion)throw Error('Unsupported source Wallet backup version');
 const source=version===targetVersion?ports.validateTarget(input):ports.inspectHistorical(input,{namespace:'wallet',version,tables:version===0?[]:Object.keys(walletTablesAt(version))});
 if(version===targetVersion)return {snapshot:source as ValidatedAppSnapshot,conversion:{fromVersion:targetVersion,toVersion:targetVersion,sourceChecksum:source.manifest.checksum,resultChecksum:source.manifest.checksum,at,converted:false}};
 let upgraded:WalletSnapshot,migration:LegacyMigrationReceipt|undefined;
 if(version===0){
  if(!legacy)throw Error('Pre-Wallet conversion requires an explicit historical owner and timezone');
  const seed=JSON.stringify([source.manifest.checksum,legacy.ownerUserId,legacy.timezone,at]);let counter=0;
  const newId=()=>{const chars=createHash('sha256').update(seed+':'+counter++).digest('hex').slice(0,32).split('');chars[12]='8';chars[16]=((parseInt(chars[16],16)&3)|8).toString(16);const h=chars.join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);};
  const plan=buildLegacyMigrationPlan(legacyFinanceSource(source.legacy),source.legacy.users,{actor:{userId:legacy.ownerUserId,role:UserRole.ADMIN},timezone:legacy.timezone,now:at,newId});upgraded=convertWalletBackup(plan.snapshot,new Set(source.legacy.users.map(user=>user.id)),targetVersion);migration=plan.receipt;
 }else{
  const native={schemaVersion:version+1,tables:Object.fromEntries(Object.keys(walletTablesAt(version)).map(name=>[name,source.tables[name]])),checksum:''};native.checksum=walletSnapshotChecksum(native);upgraded=convertWalletBackup(native,new Set(source.legacy.users.map((user:{id:string})=>user.id)),targetVersion);
 }
 const target=structuredClone(source);
 for(const name of Object.keys(target.tables))if(name.startsWith('wallet_'))delete target.tables[name];Object.assign(target.tables,upgraded.tables);
 target.manifest.domains.wallet=targetVersion;target.manifest.createdAt=at;
 const active=target.tables.app_meta.find(row=>row.key==='wallet_active');if(active)active.value='0';else target.tables.app_meta.push({key:'wallet_active',value:'0'});
 for(const row of ports.migrations.filter(row=>row.version>version))target.tables.app_migrations.push({namespace:'wallet',version:row.version,checksum:row.checksum,applied_at:at});
 target.manifest.checksum=checksum(target);const result=ports.validateTarget(target);
 return {snapshot:result,conversion:{fromVersion:version,toVersion:targetVersion,sourceChecksum:source.manifest.checksum,resultChecksum:result.manifest.checksum,at,converted:true,...(migration?{migration}:{})}};
}
