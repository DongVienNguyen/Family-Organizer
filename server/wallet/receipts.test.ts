import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {it,expect} from 'vitest';
import * as sqlite from '../sqlite.js';
import * as gateway from '../appStore.js';
import {UserRole,type User} from '../../src/types.js';
import {prepareWalletSchema,prepareWalletMetadata,prepareWalletFinancial,prepareWalletLegacyMigration} from './schema.js';
import {prepareWalletReceipts} from './receiptSchema.js';
import {createReceiptFiles} from './receiptFiles.js';
import {receiptMediaPath} from './receiptContract.js';
import {createWalletReceipts} from './receipts.js';
import {openWalletStore} from './store.js';
const actor=(id='owner',role:UserRole=UserRole.MEMBER)=>({userId:'synthetic-receipt-'+id,role});
const meta=()=>({actorId:actor().userId,command:'wallet:synthetic:receipts',requestId:randomUUID(),payloadHash:'synthetic'});
const write=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction(meta(),fn);
const reader={get:(sql:string,...args:any[]):any=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[]):any[]=>sqlite.sqliteConnection().prepare(sql).all(...args)};
const png=Buffer.from([137,80,78,71,13,10,26,10]),body=()=>({fileName:'Hóa đơn synthetic.png',dataUrl:'data:image/png;base64,'+png.toString('base64')}),recordId='synthetic-receipt-record',accountId='synthetic-receipt-account';
const ctx=(revision=1,who=actor())=>({actor:who,expectedRevision:revision,idempotencyKey:randomUUID()});
const files=createReceiptFiles({dataRoot:process.env.DATA_DIR!});
function setup(options:Partial<Parameters<typeof createWalletReceipts>[0]>={}){
 write(tx=>{prepareWalletSchema(tx);prepareWalletMetadata(tx);prepareWalletFinancial(tx);prepareWalletLegacyMigration(tx);prepareWalletReceipts(tx);
  for(const name of ['wallet_receipts','wallet_legacy_links','wallet_legacy_runs','wallet_transfer_fees','wallet_record_fx','wallet_audit_metadata','wallet_label_metadata','wallet_category_metadata','wallet_record_metadata','wallet_account_metadata','wallet_audit','wallet_allocations','wallet_record_labels','wallet_postings','wallet_records','wallet_occurrences','wallet_schedules','wallet_account_grants','wallet_accounts','wallet_categories','wallet_labels'])tx.run('DELETE FROM '+name);
  tx.run("INSERT OR REPLACE INTO app_meta(key,value)VALUES('wallet_active','1')");tx.legacy.users=['owner','other','read','contribute','manage','child','guest','admin'].map(id=>({id:actor(id).userId,role:id==='admin'?UserRole.ADMIN:id==='child'?UserRole.CHILD:id==='guest'?UserRole.GUEST:UserRole.MEMBER,username:'synthetic-receipt-'+id,fullName:'Synthetic '+id,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-17T00:00:00.000Z'} as User&{passwordHash:string}));
 });
 openWalletStore({write:gateway.withAppWriteTransaction}).transaction(meta(),tx=>{tx.accounts.insert({id:accountId,name:'Synthetic receipt account',type:'bank',currency:'VND',ownerUserId:actor().userId,accessMode:'private',openingMinor:'9007199254740993',openingDate:'2026-10-17',revision:1});tx.records.insert({id:recordId,kind:'expense',effectiveDate:'2026-10-17',timezone:'Asia/Saigon',source:'manual',note:'Synthetic receipt note',settlementStatus:'cleared',creatorId:actor().userId,revision:1});tx.postings.insert({recordId,accountId,deltaMinor:'-100'});});
 return createWalletReceipts({reader,write:gateway.withAppWriteTransaction,files,now:()=>Date.parse('2026-10-17T01:00:00.000Z'),...options});
}
const countFiles=()=>{const folder=path.join(process.env.DATA_DIR!,'uploads','wallet-receipts');return fs.existsSync(folder)?fs.readdirSync(folder).length:0;};
it('attaches/lists/reads opaque private metadata, increments revision and audits without changing money',()=>{
 const service=setup(),postings=reader.all('SELECT * FROM wallet_postings'),saved=service.attach(ctx(),recordId,body());
 expect(saved).toMatchObject({recordId,revision:2,receipt:{recordId,fileName:'Hóa đơn synthetic.png',mime:'image/png',size:png.length,createdBy:actor().userId,createdAt:'2026-10-17T01:00:00.000Z'}});
 expect(service.list(actor(),recordId)).toEqual({recordId,revision:2,receipts:[saved.receipt]});expect(service.read(actor(),recordId,saved.receipt.id)).toEqual({bytes:png,mime:'image/png',fileName:saved.receipt.fileName});
 expect(reader.all('SELECT * FROM wallet_postings')).toEqual(postings);expect(reader.get('SELECT revision FROM wallet_records WHERE id=?',recordId)).toEqual({revision:2});
 const audit=reader.get('SELECT after_json FROM wallet_audit_metadata ORDER BY rowid DESC LIMIT 1');expect(audit.after_json).toContain(saved.receipt.sha256);expect(audit.after_json).not.toContain(body().dataUrl);expect(audit.after_json).not.toContain(saved.receipt.fileName);
 expect(reader.get('SELECT value FROM app_meta WHERE key=?','media_metadata:'+receiptMediaPath(saved.receipt.fileKey))).toBeUndefined();
});
it('explicit same-key replay retains one file, mutation, revision and audit; changed body conflicts',()=>{
 const service=setup(),request=ctx(),before=countFiles(),first=service.attach(request,recordId,body());expect(service.attach(request,recordId,body())).toEqual(first);expect(countFiles()).toBe(before+1);expect(service.list(actor(),recordId).receipts).toHaveLength(1);expect(reader.get('SELECT count(*) AS n FROM wallet_audit')).toEqual({n:1});
 expect(()=>service.attach(request,recordId,{...body(),fileName:'Synthetic changed.png'})).toThrow(expect.objectContaining({status:409}));expect(countFiles()).toBe(before+1);
});
it('stale revision and audit failure roll back the manifest and only the new owned file',()=>{
 const service=setup(),before=countFiles();expect(()=>service.attach(ctx(99),recordId,body())).toThrow(expect.objectContaining({status:409}));expect(countFiles()).toBe(before);
 write(tx=>tx.exec('DROP TABLE wallet_audit_metadata'));
 try{expect(()=>service.attach(ctx(),recordId,body())).toThrow();}finally{write(tx=>prepareWalletMetadata(tx));}
 expect(countFiles()).toBe(before);expect(service.list(actor(),recordId)).toEqual({recordId,revision:1,receipts:[]});expect(reader.get('SELECT count(*) AS n FROM wallet_audit')).toEqual({n:0});
});
it('a lost commit acknowledgement never removes committed receipt bytes and retry returns the original result',()=>{
 let lose=true;const service=setup({write:((meta,fn)=>{const result=gateway.withAppWriteTransaction(meta,fn);if(lose){lose=false;throw Error('Synthetic lost acknowledgement');}return result;}) as typeof gateway.withAppWriteTransaction}),request=ctx(),before=countFiles();
 expect(()=>service.attach(request,recordId,body())).toThrow('Synthetic lost acknowledgement');expect(countFiles()).toBe(before+1);
 const result=service.attach(request,recordId,body());expect(countFiles()).toBe(before+1);expect(result.revision).toBe(2);expect(service.read(actor(),recordId,result.receipt.id).bytes).toEqual(png);expect(reader.get('SELECT count(*) AS n FROM wallet_audit')).toEqual({n:1});
});
it.each(['child','guest','private','read-only','contribute-other-creator','inactive','deleted','voided'])('denies attach %s before writing a file',kind=>{
 const service=setup();let who=actor();if(kind==='child'||kind==='guest')who=actor(kind,kind==='child'?UserRole.CHILD:UserRole.GUEST);if(kind==='private')who=actor('other');
 if(kind==='read-only'||kind==='contribute-other-creator'){who=actor(kind==='read-only'?'read':'contribute');write(tx=>tx.run('INSERT INTO wallet_account_grants VALUES(?,?,?)',accountId,who.userId,kind==='read-only'?'read':'contribute'));}
 if(kind==='inactive')write(tx=>tx.run("UPDATE app_meta SET value='0' WHERE key='wallet_active'"));if(kind==='deleted')write(tx=>{tx.legacy.users.find(user=>user.id===who.userId)!.isDeleted=true;});if(kind==='voided')write(tx=>tx.run("UPDATE wallet_records SET settlement_status='voided' WHERE id=?",recordId));
 const before=countFiles();expect(()=>service.attach(ctx(1,who),recordId,body())).toThrow();expect(countFiles()).toBe(before);expect(reader.all('SELECT * FROM wallet_receipts')).toEqual([]);
});
it('full read permission allows bytes, revocation blocks metadata/bytes/replay; manage can attach another creator',()=>{
 const service=setup(),request=ctx(),saved=service.attach(request,recordId,body());write(tx=>tx.run('INSERT INTO wallet_account_grants VALUES(?,?,?)',accountId,actor('read').userId,'read'));
 expect(service.read(actor('read'),recordId,saved.receipt.id).bytes).toEqual(png);write(tx=>tx.run('DELETE FROM wallet_account_grants'));
 expect(()=>service.list(actor('read'),recordId)).toThrow(expect.objectContaining({status:404}));expect(()=>service.read(actor('read'),recordId,saved.receipt.id)).toThrow(expect.objectContaining({status:404}));
 write(tx=>tx.run('UPDATE wallet_accounts SET owner_user_id=? WHERE id=?',actor('other').userId,accountId));const before=countFiles();expect(()=>service.attach(request,recordId,body())).toThrow(expect.objectContaining({status:404}));expect(countFiles()).toBe(before);
 write(tx=>tx.run('INSERT INTO wallet_account_grants VALUES(?,?,?)',accountId,actor('manage').userId,'manage'));expect(service.attach(ctx(2,actor('manage')),recordId,body()).revision).toBe(3);
});
it('a one-sided transfer never exposes receipt metadata or bytes',()=>{
 const service=setup(),saved=service.attach(ctx(),recordId,body());openWalletStore({write:gateway.withAppWriteTransaction}).transaction(meta(),tx=>{tx.accounts.insert({id:'synthetic-hidden-account',name:'Synthetic hidden',type:'bank',currency:'VND',ownerUserId:actor('other').userId,accessMode:'private',openingMinor:'0',openingDate:'2026-10-17',revision:1});tx.sql.run("UPDATE wallet_records SET kind='transfer' WHERE id=?",recordId);tx.postings.insert({recordId,accountId:'synthetic-hidden-account',deltaMinor:'100'});});
 expect(()=>service.list(actor(),recordId)).toThrow(expect.objectContaining({status:404}));expect(()=>service.read(actor(),recordId,saved.receipt.id)).toThrow(expect.objectContaining({status:404}));expect(service.read(actor('admin',UserRole.ADMIN),recordId,saved.receipt.id).bytes).toEqual(png);
});
it('a receipt ID from another record and a missing receipt both return404',()=>{
 const service=setup(),saved=service.attach(ctx(),recordId,body());expect(()=>service.read(actor(),recordId,randomUUID())).toThrow(expect.objectContaining({status:404}));expect(()=>service.read(actor(),'synthetic-private-missing',saved.receipt.id)).toThrow(expect.objectContaining({status:404}));
});
it('detach is revisioned/idempotent and retains unserved bytes for restore; stale writes cannot silently remove it',()=>{
 const service=setup(),saved=service.attach(ctx(),recordId,body()),before=countFiles();expect(()=>service.detach(ctx(),recordId,saved.receipt.id)).toThrow(expect.objectContaining({status:409}));
 const request=ctx(2),result=service.detach(request,recordId,saved.receipt.id);expect(result).toEqual({recordId,revision:3,receiptId:saved.receipt.id});expect(service.detach(request,recordId,saved.receipt.id)).toEqual(result);expect(service.list(actor(),recordId).receipts).toEqual([]);expect(()=>service.read(actor(),recordId,saved.receipt.id)).toThrow(expect.objectContaining({status:404}));expect(countFiles()).toBe(before);expect(reader.get('SELECT count(*) AS n FROM wallet_audit')).toEqual({n:2});
});
it('rechecks grants inside I01 after staging; a revoked write removes only its unclaimed stage',()=>{
 const service=setup({files:createReceiptFiles({dataRoot:process.env.DATA_DIR!,onBoundary:phase=>{if(phase==='after-sync')write(tx=>tx.run('UPDATE wallet_accounts SET owner_user_id=? WHERE id=?',actor('other').userId,accountId));}})}),before=countFiles();
 expect(()=>service.attach(ctx(),recordId,body())).toThrow(expect.objectContaining({status:404}));expect(countFiles()).toBe(before);expect(reader.all('SELECT * FROM wallet_receipts')).toEqual([]);
});

it('limits one record to20 receipts while permitting same-key replay at capacity',()=>{
 const service=setup(),before=countFiles(),request=ctx(),first=service.attach(request,recordId,body());
 for(let revision=2;revision<=20;revision++)service.attach(ctx(revision),recordId,body());
 expect(service.list(actor(),recordId).receipts).toHaveLength(20);expect(service.attach(request,recordId,body())).toEqual(first);expect(countFiles()).toBe(before+20);
 expect(()=>service.attach(ctx(21),recordId,body())).toThrow(expect.objectContaining({status:413}));expect(countFiles()).toBe(before+20);expect(reader.get('SELECT revision FROM wallet_records WHERE id=?',recordId)).toEqual({revision:21});
});

it('receipt audits bind before/after record revisions without recording receipt bytes or raw names',()=>{
 const service=setup(),saved=service.attach(ctx(),recordId,body());service.detach(ctx(2),recordId,saved.receipt.id);
 const rows=reader.all('SELECT a.action,m.before_json,m.after_json FROM wallet_audit a JOIN wallet_audit_metadata m ON m.audit_id=a.id ORDER BY a.action');
 expect(JSON.parse(rows[0].before_json)).toMatchObject({recordId,revision:1,receipt:null});expect(JSON.parse(rows[0].after_json)).toMatchObject({recordId,revision:2,receipt:{id:saved.receipt.id}});expect(JSON.parse(rows[1].before_json)).toMatchObject({recordId,revision:2,receipt:{id:saved.receipt.id}});expect(JSON.parse(rows[1].after_json)).toEqual({recordId,revision:3,receipt:null});expect(JSON.stringify(rows)).not.toContain(body().dataUrl);expect(JSON.stringify(rows)).not.toContain(body().fileName);
});
