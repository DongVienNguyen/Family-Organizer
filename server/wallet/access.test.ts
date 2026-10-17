import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as access from './access.js';
import {UserRole,type User} from '../../src/types.js';
import {withAppWriteTransaction} from '../appStore.js';
import {sqliteConnection,sqliteLoad} from '../sqlite.js';
import {prepareWalletSchema} from './schema.js';
import {openWalletStore,type WalletTx} from './store.js';
const actor=(id='member',role:UserRole=UserRole.MEMBER)=>({userId:'synthetic-acl-'+id,role});
const meta=()=>({actorId:actor('admin',UserRole.ADMIN).userId,command:'wallet:synthetic:access',requestId:randomUUID(),payloadHash:'synthetic'});
const write=<T>(fn:Parameters<typeof withAppWriteTransaction<T>>[1])=>withAppWriteTransaction(meta(),fn);
const store=openWalletStore({write:withAppWriteTransaction});
const account=(id='private',extra:any={})=>({id:'synthetic-acl-'+id,name:'Synthetic account '+id,type:'bank' as const,currency:'VND',ownerUserId:actor('owner').userId,accessMode:'private' as const,openingMinor:'9223372036854775807',openingDate:'2026-10-17',revision:1,...extra});
const record=(id='private-record',extra:any={})=>({id:'synthetic-acl-'+id,kind:'expense' as const,effectiveDate:'2026-10-17',timezone:'Asia/Saigon',source:'manual' as const,note:'Synthetic only',settlementStatus:'cleared' as const,creatorId:actor().userId,revision:1,...extra});
const reader={get:(sql:string,...args:any[])=>sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[])=>sqliteConnection().prepare(sql).all(...args)};
const user=(id:string,role:UserRole):User&{passwordHash:string}=>({id:actor(id,role).userId,role,username:'synthetic-acl-'+id,fullName:'Synthetic ACL '+id,passwordHash:'synthetic-offline',avatarColor:'blue',createdAt:'2026-10-17T00:00:00.000Z'});
function setup(){
 write(tx=>{prepareWalletSchema(tx);for(const table of ['wallet_audit','wallet_allocations','wallet_record_labels','wallet_postings','wallet_records','wallet_occurrences','wallet_schedules','wallet_account_grants','wallet_accounts','wallet_categories','wallet_labels'])tx.run('DELETE FROM '+table);tx.legacy.users=[user('admin',UserRole.ADMIN),...['owner','member','other','read','contribute','manage'].map(id=>user(id,UserRole.MEMBER)),user('child',UserRole.CHILD),user('guest',UserRole.GUEST)];});
 store.transaction(meta(),tx=>{tx.accounts.insert(account());tx.accounts.insert(account('shared',{accessMode:'shared'}));tx.accounts.insert(account('hidden',{name:'SYNTHETIC PRIVATE COUNTERPARTY',currency:'USD',ownerUserId:actor('other').userId}));for(const permission of ['read','contribute','manage'])tx.sql.run('INSERT INTO wallet_account_grants VALUES(?,?,?)',account().id,actor(permission).userId,permission);
  tx.records.insert(record());tx.postings.insert({recordId:record().id,accountId:account().id,deltaMinor:'-9223372036854775808'});
  tx.records.insert(record('hidden-record',{creatorId:actor('other').userId,note:'SYNTHETIC HIDDEN RECORD'}));tx.postings.insert({recordId:record('hidden-record').id,accountId:account('hidden').id,deltaMinor:'-9999'});
  tx.records.insert(record('transfer',{kind:'transfer',note:'SYNTHETIC PRIVATE COUNTERPARTY',externalKey:'synthetic-secret-source'}));tx.postings.insert({recordId:record('transfer').id,accountId:account().id,deltaMinor:'-100'});tx.postings.insert({recordId:record('transfer').id,accountId:account('hidden').id,deltaMinor:'12345'});
 });
 return access.createWalletAccess(reader);
}
it('provides account access resolution and a fresh SQL access facade',()=>{expect(access).toHaveProperty('resolveAccountAccess',expect.any(Function));expect(access).toHaveProperty('createWalletAccess',expect.any(Function));});
it.each([
 ['admin',UserRole.ADMIN,'private','manage'],['owner',UserRole.MEMBER,'private','manage'],['member',UserRole.MEMBER,'private','none'],['member',UserRole.MEMBER,'shared','contribute'],['read',UserRole.MEMBER,'private','read'],['contribute',UserRole.MEMBER,'private','contribute'],['manage',UserRole.MEMBER,'private','manage'],['child',UserRole.CHILD,'shared','none'],['child',UserRole.CHILD,'private','none'],['guest',UserRole.GUEST,'shared','none'],['guest',UserRole.GUEST,'private','none'],
] as const)('resolves %s/%s account %s to %s',(_id,role,id,want)=>{
 const a=account(id,{accessMode:id==='shared'?'shared':'private'}),grants=['read','contribute','manage','child','guest'].map(userId=>({accountId:a.id,userId:actor(userId).userId,permission:userId==='child'||userId==='guest'?'manage':userId}));expect(access.resolveAccountAccess(actor(_id,role),a,grants as any)).toBe(want);
});
it.each([UserRole.CHILD,UserRole.GUEST])('never grants owner or manage privileges to role %s',role=>{const a=actor('owner',role);expect(access.resolveAccountAccess(a,account(),[{accountId:account().id,userId:a.userId,permission:'manage'}])).toBe('none');});
it('read grant attenuates the shared adult default, and grants from another account or actor are ignored',()=>{
 const a=account('shared',{accessMode:'shared'});expect(access.resolveAccountAccess(actor(),a,[{accountId:a.id,userId:actor().userId,permission:'read'}])).toBe('read');expect(access.resolveAccountAccess(actor(),account(),[{accountId:a.id,userId:actor().userId,permission:'manage'},{accountId:account().id,userId:actor('other').userId,permission:'manage'}])).toBe('none');expect(access.resolveAccountAccess({userId:'',role:'admin'} as any,a,[])).toBe('none');expect(access.resolveAccountAccess({userId:actor().userId,role:'superadmin'} as any,a,[])).toBe('none');
});
it('limits account reads before decoding bodies and preserves exact signed64 opening money',()=>{
 const service=setup();expect(service.visibleAccountIds(actor('read'))).toEqual([account().id,account('shared').id].sort());expect(service.listAccounts(actor('read')).map(a=>a.id)).toEqual(service.visibleAccountIds(actor('read')));expect(service.getAccount(actor('read'),account().id)).toMatchObject({id:account().id,permission:'read',openingMinor:'9223372036854775807',archivedAt:null});expect(()=>service.getAccount(actor(),account().id)).toThrow(expect.objectContaining({status:404}));expect(()=>service.getAccount(actor('read'),account('hidden').id)).toThrow(expect.objectContaining({status:404}));expect(service.listAccounts(actor('admin',UserRole.ADMIN))).toHaveLength(3);
});
it.each([['child',UserRole.CHILD],['guest',UserRole.GUEST]])('refuses %s before issuing finance SQL even with a forged manage grant',(_id,role)=>{
 setup();write(tx=>tx.run('INSERT INTO wallet_account_grants VALUES(?,?,?)',account().id,actor(_id,role).userId,'manage'));
 const queries:string[]=[],tracked={get:(sql:string,...args:any[])=>{queries.push(sql);return reader.get(sql,...args);},all:(sql:string,...args:any[])=>{queries.push(sql);return reader.all(sql,...args);}},service=access.createWalletAccess(tracked);
 for(const fn of [()=>service.visibleAccountIds(actor(_id,role)),()=>service.listAccounts(actor(_id,role)),()=>service.getAccount(actor(_id,role),account().id),()=>service.getRecord(actor(_id,role),record().id),()=>service.authorizeRecord(actor(_id,role),record().id,'write')])expect(fn).toThrow(expect.objectContaining({status:403}));expect(queries.filter(sql=>sql.includes('wallet_'))).toEqual([]);
});
it('checks current role, deletion and unknown identity on every operation instead of trusting the caller role',()=>{
 const service=setup();write(tx=>{tx.legacy.users.find(u=>u.id===actor('admin',UserRole.ADMIN).userId)!.role=UserRole.CHILD;tx.legacy.users.find(u=>u.id===actor('read').userId)!.isDeleted=true;});for(const who of [actor('admin',UserRole.ADMIN),actor('read'),actor('nonexistent')])expect(()=>service.visibleAccountIds(who)).toThrow(expect.objectContaining({status:403}));
});
it('uses current in-transaction legacy authority before its final SQL flush',()=>{
 setup();store.transaction(meta(),tx=>{tx.legacy.users.find(u=>u.id===actor('read').userId)!.role=UserRole.CHILD;const service=access.createWalletAccess({...tx.sql,get legacy(){return tx.legacy;}});expect(()=>service.visibleAccountIds(actor('read'))).toThrow(expect.objectContaining({status:403}));});
});
it('a hidden record and missing record both return404 without disclosing its canonical body',()=>{
 const service=setup();for(const id of [record('hidden-record').id,'synthetic-nonexistent'])expect(()=>service.getRecord(actor('read'),id)).toThrow(expect.objectContaining({status:404}));
});
it('projects one readable transfer leg without the hidden account ID/name/currency/amount or free metadata',()=>{
 const service=setup(),value=service.getRecord(actor('read'),record('transfer').id),encoded=JSON.stringify(value);expect(value.partial).toBe(true);expect(value.postings).toEqual([{recordId:record('transfer').id,accountId:account().id,deltaMinor:'-100',currency:'VND'}]);expect(value.record.note).toBe('');expect(value.record).not.toHaveProperty('externalKey');for(const hidden of [account('hidden').id,'SYNTHETIC PRIVATE COUNTERPARTY','USD','12345','synthetic-secret-source'])expect(encoded).not.toContain(hidden);expect(()=>service.authorizeRecord(actor('read'),record('transfer').id,'read')).not.toThrow();
});
it('projects complete admin transfers with both independently valued currency legs',()=>{
 const service=setup(),value=service.getRecord(actor('admin',UserRole.ADMIN),record('transfer').id);expect(value.partial).toBe(false);expect(value.record.note).toBe('SYNTHETIC PRIVATE COUNTERPARTY');expect(value.postings).toEqual([{recordId:record('transfer').id,accountId:account('hidden').id,deltaMinor:'12345',currency:'USD'},{recordId:record('transfer').id,accountId:account().id,deltaMinor:'-100',currency:'VND'}]);
});
it('a read grant cannot edit even its own record; contribute can edit own but not another creator; manage can edit either',()=>{
 const service=setup();for(const who of ['read','contribute'])expect(()=>service.authorizeRecord(actor(who),record().id,'write')).toThrow(expect.objectContaining({status:403}));for(const who of ['manage','admin'])expect(()=>service.authorizeRecord(actor(who,who==='admin'?UserRole.ADMIN:UserRole.MEMBER),record().id,'write')).not.toThrow();
 write(tx=>tx.run('UPDATE wallet_records SET creator_id=? WHERE id=?',actor('contribute').userId,record().id));expect(()=>service.authorizeRecord(actor('contribute'),record().id,'write')).not.toThrow();write(tx=>tx.run('UPDATE wallet_records SET creator_id=? WHERE id=?',actor('read').userId,record().id));expect(()=>service.authorizeRecord(actor('read'),record().id,'write')).toThrow(expect.objectContaining({status:403}));
});
it('transfer edits need current contribute/manage on both legs and manage everywhere for another creator',()=>{
 const service=setup();expect(()=>service.authorizeRecord(actor('contribute'),record('transfer').id,'write')).toThrow(expect.objectContaining({status:404}));write(tx=>{tx.run('UPDATE wallet_records SET creator_id=? WHERE id=?',actor('contribute').userId,record('transfer').id);tx.run('INSERT INTO wallet_account_grants VALUES(?,?,?)',account('hidden').id,actor('contribute').userId,'read');});expect(()=>service.authorizeRecord(actor('contribute'),record('transfer').id,'write')).toThrow(expect.objectContaining({status:403}));write(tx=>tx.run("UPDATE wallet_account_grants SET permission='contribute' WHERE account_id=? AND user_id=?",account('hidden').id,actor('contribute').userId));expect(()=>service.authorizeRecord(actor('contribute'),record('transfer').id,'write')).not.toThrow();write(tx=>tx.run('UPDATE wallet_records SET creator_id=? WHERE id=?',actor('other').userId,record('transfer').id));expect(()=>service.authorizeRecord(actor('contribute'),record('transfer').id,'write')).toThrow(expect.objectContaining({status:403}));write(tx=>tx.run("UPDATE wallet_account_grants SET permission='manage' WHERE user_id=?",actor('contribute').userId));expect(()=>service.authorizeRecord(actor('contribute'),record('transfer').id,'write')).not.toThrow();
});
it('revocation is observed by the same facade without a stale account or record result',()=>{
 const service=setup();expect(service.getRecord(actor('read'),record().id).record.id).toBe(record().id);write(tx=>tx.run('DELETE FROM wallet_account_grants WHERE account_id=? AND user_id=?',account().id,actor('read').userId));expect(service.visibleAccountIds(actor('read'))).toEqual([account('shared').id]);expect(()=>service.getAccount(actor('read'),account().id)).toThrow(expect.objectContaining({status:404}));expect(()=>service.getRecord(actor('read'),record().id)).toThrow(expect.objectContaining({status:404}));
});
it('access queries remain read-only and an escaped transactional facade cannot use a closed handle',()=>{
 const service=setup(),before=reader.get('SELECT total_changes() AS n'),legacy=sqliteLoad();service.listAccounts(actor('admin',UserRole.ADMIN));service.getRecord(actor('read'),record().id);service.authorizeRecord(actor('manage'),record().id,'write');expect(reader.get('SELECT total_changes() AS n')).toEqual(before);expect(sqliteLoad()).toEqual(legacy);let escaped:ReturnType<typeof access.createWalletAccess>|undefined;store.transaction(meta(),tx=>{escaped=access.createWalletAccess({...tx.sql,get legacy(){return tx.legacy;}});});expect(()=>escaped!.visibleAccountIds(actor('read'))).toThrow('Transaction handle is closed');
});
it('the SQL shared default honors an explicit read grant and returns to the family default when that grant is removed',()=>{
 const service=setup();write(tx=>tx.run('INSERT INTO wallet_account_grants VALUES(?,?,?)',account('shared').id,actor().userId,'read'));expect(service.getAccount(actor(),account('shared').id).permission).toBe('read');write(tx=>tx.run('DELETE FROM wallet_account_grants WHERE account_id=? AND user_id=?',account('shared').id,actor().userId));expect(service.getAccount(actor(),account('shared').id).permission).toBe('contribute');
});
it('parameterized account and record IDs cannot widen scope with SQL text',()=>{
 const service=setup();for(const id of ["synthetic' OR 1=1--",'synthetic\" UNION SELECT * FROM wallet_accounts--']){expect(()=>service.getAccount(actor('read'),id)).toThrow(expect.objectContaining({status:404}));expect(()=>service.getRecord(actor('read'),id)).toThrow(expect.objectContaining({status:404}));}expect(service.visibleAccountIds(actor('read'))).not.toContain(account('hidden').id);
});
