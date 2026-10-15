// CI-only synthetic Wallet1 seed; never a runtime migration/activation entrypoint.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {UserRole} from '../../src/types.js';
import {walletCoreSql,walletCoreChecksum} from '../../server/wallet/schema.js';
import {walletSnapshotColumns,moneyColumns} from '../../server/wallet/snapshot.js';
const target=process.argv[2],commitSha=process.env.TEST_COMMIT_SHA;
if(!target||!commitSha||!/^[a-f0-9]{40}$/.test(commitSha))throw Error('Synthetic Wallet fixture identity required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'family-wallet-seed-'));process.env.DATA_DIR=path.join(root,'data');process.env.CONFIG_DIR=path.join(root,'config');process.env.LOG_DIR=path.join(root,'logs');process.env.NODE_ENV='test';
let sqlite:typeof import('../../server/sqlite.js')|undefined;
try{
 sqlite=await import('../../server/sqlite.js');const gateway=await import('../../server/appStore.js'),migrations=await import('../../server/appMigrations.js'),snapshot=await import('../../server/appSnapshot.js'),{configureWalletStorage}=await import('../../server/wallet/integration.js'),{openWalletStore}=await import('../../server/wallet/store.js');
 const meta=()=>({actorId:'system:synthetic',command:'wallet:ci-seed',requestId:randomUUID(),payloadHash:'synthetic'});gateway.withAppWriteTransaction(meta(),tx=>{tx.legacy.users=[{id:'package-admin',username:'synthetic-wallet-package',fullName:'Synthetic Wallet package actor',role:UserRole.ADMIN,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-15T00:00:00Z'}];});
 configureWalletStorage({migrations,snapshot});migrations.applyDomainMigrations({enabled:['wallet'],pilot:true});const store=openWalletStore({write:gateway.withAppWriteTransaction});
 store.transaction(meta(),tx=>{tx.accounts.insert({id:'canonical-wallet-account',name:'Synthetic Wallet package account',type:'bank',currency:'VND',ownerUserId:'package-admin',accessMode:'private',openingMinor:'9223372036854775807',openingDate:'2026-10-15',revision:1});tx.records.insert({id:'canonical-wallet-record',kind:'expense',effectiveDate:'2026-10-15',timezone:'Asia/Saigon',source:'manual',note:'',settlementStatus:'cleared',creatorId:'package-admin',revision:1});tx.postings.insert({recordId:'canonical-wallet-record',accountId:'canonical-wallet-account',deltaMinor:'-9223372036854775808'});});
 const saved=gateway.withAppWriteTransaction(meta(),snapshot.collectAppSnapshot),value={format:1,commitSha,version:1,checksum:walletCoreChecksum,schemaSql:walletCoreSql,columns:walletSnapshotColumns,moneyColumns,tables:Object.fromEntries(Object.keys(walletSnapshotColumns).map(name=>[name,saved.tables[name]])),migration:saved.tables.app_migrations.find(row=>row.namespace==='wallet')};
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(value,null,2)+'\n');
}finally{sqlite?.sqliteClose();fs.rmSync(root,{recursive:true,force:true});}
