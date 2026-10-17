import type {Actor} from '../../src/features/wallet/contracts.js';
import {UserRole,type User} from '../../src/types.js';
import {text,choice} from '../../src/features/productivity/validation.js';
import {AppStoreError} from '../appErrors.js';
import type {WalletAccount,WalletRecord,WalletPosting} from './store.js';
export type WalletPermission='read'|'contribute'|'manage';
export interface WalletAccountGrant {accountId:string;userId:string;permission:WalletPermission}
export interface WalletReader {get(sql:string,...args:any[]):any;all(sql:string,...args:any[]):any[];readonly legacy?:{users:User[]}}
export interface AccessibleWalletAccount extends WalletAccount {archivedAt:string|null;permission:WalletPermission}
export interface AccessibleWalletRecord {record:WalletRecord;postings:(WalletPosting&{currency:string})[];partial:boolean}
const permissions=['read','contribute','manage'] as const;
const adult=(actor:Actor)=>typeof actor?.userId==='string'&&!!actor.userId.trim()&&[UserRole.ADMIN,UserRole.MEMBER].includes(actor.role as UserRole);
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,status===404?'wallet-not-found':'wallet-forbidden');};
/** Historical snapshot references do not grant live finance rights. */
export function resolveAccountAccess(actor:Actor,account:WalletAccount,grants:readonly WalletAccountGrant[]):WalletPermission|'none' {
 if(!adult(actor))return 'none';
 if(actor.role===UserRole.ADMIN||account.ownerUserId===actor.userId)return 'manage';
 const grant=grants.find(g=>g.accountId===account.id&&g.userId===actor.userId);
 if(grant)return permissions.includes(grant.permission)?grant.permission:'none';
 return account.accessMode==='shared'?'contribute':'none';
}
export function assertWalletActor(reader:WalletReader,actor:Actor):User {
 try{text(actor?.userId,256);choice(actor?.role,[UserRole.ADMIN,UserRole.MEMBER]);}catch{fail(403,'Không có quyền truy cập tài chính.');}
 const legacy=reader.legacy,raw=legacy?undefined:reader.get('SELECT data FROM users WHERE id=?',actor.userId);
 const user:User|undefined=legacy?legacy.users.find(user=>user.id===actor.userId):raw?JSON.parse(raw.data):undefined;
 if(!user||user.isDeleted||user.role!==actor.role||!adult(actor))fail(403,'Không có quyền truy cập tài chính.');
 return user;
}
function permissionScope(actor:Actor):{sql:string;args:string[]} {
 if(actor.role===UserRole.ADMIN)return {sql:"'manage'",args:[]};
 return {sql:"CASE WHEN a.owner_user_id=? THEN 'manage' ELSE COALESCE((SELECT CASE WHEN g.permission IN('read','contribute','manage') THEN g.permission ELSE 'none' END FROM wallet_account_grants g WHERE g.account_id=a.id AND g.user_id=?),CASE WHEN a.access_mode='shared' THEN 'contribute' ELSE 'none' END) END",args:[actor.userId,actor.userId]};
}
/** Fresh role/deletion gate plus a parameterized permission expression for alias a. */
export function walletAccountReadScope(reader:WalletReader,actor:Actor):{sql:string;args:string[]} {assertWalletActor(reader,actor);return permissionScope(actor);}
const allowed=(sql:string)=>'('+sql+") IN('read','contribute','manage')";
const accountColumns='a.id,a.name,a.type,a.currency,a.owner_user_id AS ownerUserId,a.access_mode AS accessMode,CAST(a.opening_minor AS TEXT) AS openingMinor,a.opening_date AS openingDate,a.revision,a.archived_at AS archivedAt';
const recordColumns='r.id,r.kind,r.effective_date AS effectiveDate,r.timezone,r.source,r.external_key AS externalKey,r.note,r.settlement_status AS settlementStatus,r.creator_id AS creatorId,r.revision,r.category_id AS categoryId,r.occurrence_id AS occurrenceId';
/** Fresh SQL ACL precedes canonical bodies; this facade owns no writer/cache. */
export function createWalletAccess(reader:WalletReader){
 const getAccount=(actor:Actor,id:string):AccessibleWalletAccount=>{
  assertWalletActor(reader,actor);text(id,256);const scope=permissionScope(actor);
  const row=reader.get('SELECT '+accountColumns+',('+scope.sql+') AS permission FROM wallet_accounts a WHERE a.id=? AND '+allowed(scope.sql),...scope.args,id,...scope.args);
  if(!row)fail(404,'Không tìm thấy tài khoản.');return row;
 };
 const getRecord=(actor:Actor,id:string):AccessibleWalletRecord=>{
  assertWalletActor(reader,actor);text(id,256);const scope=permissionScope(actor);
  const record=reader.get('SELECT '+recordColumns+' FROM wallet_records r WHERE r.id=? AND EXISTS(SELECT 1 FROM wallet_postings p JOIN wallet_accounts a ON a.id=p.account_id WHERE p.record_id=r.id AND '+allowed(scope.sql)+')',id,...scope.args);
  if(!record)fail(404,'Không tìm thấy giao dịch.');
  for(const key of ['externalKey','categoryId','occurrenceId'])if(record[key]===null)delete record[key];
  const postings=reader.all('SELECT p.record_id AS recordId,p.account_id AS accountId,CAST(p.delta_minor AS TEXT) AS deltaMinor,a.currency FROM wallet_postings p JOIN wallet_accounts a ON a.id=p.account_id WHERE p.record_id=? AND '+allowed(scope.sql)+' ORDER BY p.account_id',id,...scope.args);
  const partial=!!reader.get('SELECT EXISTS(SELECT 1 FROM wallet_postings p JOIN wallet_accounts a ON a.id=p.account_id WHERE p.record_id=? AND NOT '+allowed(scope.sql)+') AS hidden',id,...scope.args).hidden;
  // Partial transfers never carry free text/source identifiers that can name or
  // encode the inaccessible counterparty. No hidden posting is decoded.
  if(partial){record.note='';delete record.externalKey;}
  return {record,postings,partial};
 };
 return {
  getAccount,getRecord,
  visibleAccountIds(actor:Actor):string[]{assertWalletActor(reader,actor);const scope=permissionScope(actor);return reader.all('SELECT a.id FROM wallet_accounts a WHERE '+allowed(scope.sql)+' ORDER BY a.id',...scope.args).map(row=>row.id);},
  listAccounts(actor:Actor):AccessibleWalletAccount[]{assertWalletActor(reader,actor);const scope=permissionScope(actor);return reader.all('SELECT '+accountColumns+',('+scope.sql+') AS permission FROM wallet_accounts a WHERE '+allowed(scope.sql)+' ORDER BY a.id',...scope.args,...scope.args);},
  authorizeRecord(actor:Actor,id:string,action:'read'|'write'):void {
   choice(action,['read','write']);const value=getRecord(actor,id);if(action==='read')return;
   if(value.partial)fail(404,'Không tìm thấy giao dịch có thể sửa.');
   for(const posting of value.postings){const permission=getAccount(actor,posting.accountId).permission;if(permission==='read'||value.record.creatorId!==actor.userId&&permission!=='manage')fail(403,'Không có quyền sửa giao dịch.');}
  },
 };
}
