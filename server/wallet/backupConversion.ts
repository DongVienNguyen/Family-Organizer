import type {AppSnapshot,ValidatedAppSnapshot} from '../snapshotValidation.js';
import {checksum} from '../snapshotValidation.js';
import {walletCoreChecksum,walletMetadataChecksum,walletFinancialChecksum,walletLegacyMigrationChecksum} from './schema.js';
import {validate,walletSnapshotChecksum,walletTablesAt,type WalletSnapshot} from './snapshot.js';
import {walletMetadataColumns} from './metadata.js';
import {walletMetadataParents} from './metadataSchema.js';
/** Explicit offline conversion only; normal restore remains version-exact.
 * Missing historical facts remain unknown, and financial validation refuses
 * transfers whose original quote cannot be recovered from the source bytes. */
export function convertWalletBackup(value:unknown,userIds:Set<string>):WalletSnapshot {
 validate(value,userIds);const source=structuredClone(value);if(source.schemaVersion===5)return source;
 const tables=Object.fromEntries(Object.keys(walletTablesAt(4)).map(name=>[name,source.tables[name]??[]]));
 if(source.schemaVersion===2){
  const provenance={created_at:null,updated_at:null,created_by:null,updated_by:null};
  for(const [name,parent]of Object.entries(walletMetadataParents)){
   const table=name as keyof typeof walletMetadataColumns,columns=walletMetadataColumns[table];
   const defaults=table==='wallet_account_metadata'?{...provenance,excluded_from_stats:0,credit_limit_minor:null,due_day:null,balance_display:'book'}:table==='wallet_record_metadata'?{...provenance,occurred_at:null,payee:'',payment_method:'',reviewed_at:null}:table==='wallet_audit_metadata'?{occurred_at:null,before_json:null,after_json:null}:{...provenance,icon:'',color:'',hidden:0,revision:1};
   tables[table]=tables[parent].map(row=>({[columns[0]]:row.id,...defaults}));
  }
 }
 const result={schemaVersion:5,tables,checksum:''};result.checksum=walletSnapshotChecksum(result);validate(result,userIds);return result;
}

interface ConversionPorts {installedVersion:number;migrations:{version:number;checksum:string;applied_at:string}[];inspectHistorical:(value:unknown,source:{namespace:'wallet'|'productivity';version:number;tables:readonly string[]})=>AppSnapshot;validateTarget:(value:unknown)=>ValidatedAppSnapshot}
function timestamp(value:string){if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw Error('Invalid explicit backup conversion time');}
/** Host binds trusted I01 inspection/validation and installed migration records.
 * wallet0/legacy JSON and other namespace upgrades need separate converters.
 * This returns converted bytes only; the caller still owns restore/maintenance. */
export function convertSharedWalletBackup(input:unknown,ports:ConversionPorts,at:string):{snapshot:ValidatedAppSnapshot;conversion:{fromVersion:number;toVersion:4;sourceChecksum:string;resultChecksum:string;at:string;converted:boolean}} {
 timestamp(at);const hashes=[walletCoreChecksum,walletMetadataChecksum,walletFinancialChecksum,walletLegacyMigrationChecksum];
 if(ports.installedVersion!==4||ports.migrations.length!==4||ports.migrations.some((row,i)=>row.version!==i+1||row.checksum!==hashes[i]))throw Error('Wallet backup conversion requires the installed trusted version4 chain');for(const row of ports.migrations)timestamp(row.applied_at);
 const version=(input as AppSnapshot)?.manifest?.domains?.wallet;if(![1,2,3,4].includes(version))throw Error('Unsupported source Wallet backup version');
 const source=version===4?ports.validateTarget(input):ports.inspectHistorical(input,{namespace:'wallet',version,tables:Object.keys(walletTablesAt(version))});
 if(version===4)return {snapshot:source as ValidatedAppSnapshot,conversion:{fromVersion:4,toVersion:4,sourceChecksum:source.manifest.checksum,resultChecksum:source.manifest.checksum,at,converted:false}};
 const native={schemaVersion:version+1,tables:Object.fromEntries(Object.keys(walletTablesAt(version)).map(name=>[name,source.tables[name]])),checksum:''};native.checksum=walletSnapshotChecksum(native);
 const upgraded=convertWalletBackup(native,new Set(source.legacy.users.map((user:{id:string})=>user.id))),target=structuredClone(source);
 for(const name of Object.keys(target.tables))if(name.startsWith('wallet_'))delete target.tables[name];Object.assign(target.tables,upgraded.tables);
 target.manifest.domains.wallet=4;target.manifest.createdAt=at;
 const active=target.tables.app_meta.find(row=>row.key==='wallet_active');if(active)active.value='0';else target.tables.app_meta.push({key:'wallet_active',value:'0'});
 for(const row of ports.migrations.filter(row=>row.version>version))target.tables.app_migrations.push({namespace:'wallet',version:row.version,checksum:row.checksum,applied_at:at});
 target.manifest.checksum=checksum(target);const result=ports.validateTarget(target);
 return {snapshot:result,conversion:{fromVersion:version,toVersion:4,sourceChecksum:source.manifest.checksum,resultChecksum:result.manifest.checksum,at,converted:true}};
}
