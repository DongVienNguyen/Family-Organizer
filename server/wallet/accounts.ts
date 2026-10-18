import {createHash,randomUUID} from 'node:crypto';
import type {Actor,CommandContext,Money} from '../../src/features/wallet/contracts.js';
import {object,keys,text,integer,choice,boolean} from '../../src/features/productivity/validation.js';
import {minorInteger,currencyExponent} from '../../src/features/wallet/money.js';
import {parseEffectiveDate} from '../../src/features/wallet/dates.js';
import {AppStoreError} from '../appErrors.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {openWalletStore,type WalletAccount,type WalletTx} from './store.js';
import {createWalletAccess,assertWalletActor,type WalletReader,type AccessibleWalletAccount,type WalletPermission,type WalletAccountGrant} from './access.js';
import {walletMetadataColumns,decodeMetadata,validateMetadata,type WalletAccountMetadata} from './metadata.js';
export interface AccountDraft {name:string;type:WalletAccount['type'];currency:string;openingMinor:string;openingDate:string;accessMode:WalletAccount['accessMode'];excludedFromStats?:boolean;creditLimitMinor?:string|null;dueDay?:number|null;balanceDisplay?:WalletAccountMetadata['balanceDisplay']}
export type AccountPatch=Partial<AccountDraft>&{archived?:boolean};
export interface WalletAccountResult {account:AccessibleWalletAccount;metadata:WalletAccountMetadata}
export interface WalletGrantResult {accountId:string;revision:number;grant:{userId:string;permission:WalletPermission|null}}
export interface WalletCreditPosition {currency:string;bookMinor:string;creditLimitMinor:string|null;debtMinor:string;availableMinor:string|null;utilization:{numerator:string;denominator:string}|null}
const fields=['name','type','currency','openingMinor','openingDate','accessMode','excludedFromStats','creditLimitMinor','dueDay','balanceDisplay'];
const fail=(status:number,message:string,code='wallet-account'):never=>{throw new AppStoreError(message,status,code);};
const txReader=(tx:WalletTx):WalletReader=>({...tx.sql,get legacy(){return tx.legacy;}});
export function assertWalletCommandContext(ctx:CommandContext,reader:WalletReader,editing=false):void {
 assertWalletActor(reader,ctx?.actor);
 try{text(ctx.idempotencyKey,256);if(editing)integer(ctx.expectedRevision,1);else if(ctx.expectedRevision!==undefined&&ctx.expectedRevision!==0)fail(409,'Phiên bản tạo mới phải bằng 0.','edit-conflict');}catch(error){if(error instanceof AppStoreError)throw error;fail(400,'Lệnh tài khoản không hợp lệ.');}
 if(reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1')fail(409,'Kho Wallet chưa được kích hoạt.','wallet-storage-inactive');
}
const context=assertWalletCommandContext;
function input(value:unknown,patch=false):Record<string,unknown> {
 try{const v=object(value);keys(v,patch?[...fields,'archived']:fields);if(!Object.keys(v).length||Object.values(v).some(x=>x===undefined))throw Error();return structuredClone(v);}catch{fail(400,'Trường tài khoản không hợp lệ.');}
}
function draft(value:Record<string,unknown>):Required<AccountDraft> {
 try{
  text(value.name,500);choice(value.type,['cash','bank','savings','credit','e_wallet','investment','asset','liability']);text(value.currency,3);currencyExponent(value.currency);minorInteger(value.openingMinor);text(value.openingDate,10);parseEffectiveDate(value.openingDate);choice(value.accessMode,['shared','private']);
  const settings={excludedFromStats:value.excludedFromStats===undefined?false:value.excludedFromStats,creditLimitMinor:value.creditLimitMinor??null,dueDay:value.dueDay??null,balanceDisplay:value.balanceDisplay===undefined?'book':value.balanceDisplay};
  validateMetadata('wallet_account_metadata',{accountId:'validation-only',...settings,createdAt:null,updatedAt:null,createdBy:null,updatedBy:null});
  return {name:value.name,type:value.type,currency:value.currency,openingMinor:value.openingMinor as string,openingDate:value.openingDate as string,accessMode:value.accessMode,...settings} as Required<AccountDraft>;
 }catch{fail(422,'Giá trị tài khoản không hợp lệ.');}
}
const normalized=(value:Record<string,unknown>)=>Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]]));
function settings(value:Pick<WalletAccountMetadata,'excludedFromStats'|'creditLimitMinor'|'dueDay'|'balanceDisplay'>){return {excludedFromStats:value.excludedFromStats,creditLimitMinor:value.creditLimitMinor,dueDay:value.dueDay,balanceDisplay:value.balanceDisplay};}
function result(reader:WalletReader,actor:Actor,id:string):WalletAccountResult {
 const account=createWalletAccess(reader).getAccount(actor,id),columns=walletMetadataColumns.wallet_account_metadata;
 const row=reader.get('SELECT '+columns.map(column=>column==='credit_limit_minor'?'CAST(credit_limit_minor AS TEXT) AS credit_limit_minor':column).join(',')+' FROM wallet_account_metadata WHERE account_id=?',id);
 if(!row)fail(409,'Thiếu metadata tài khoản.');return {account,metadata:decodeMetadata('wallet_account_metadata',row) as unknown as WalletAccountMetadata};
}
function manager(reader:WalletReader,actor:Actor,id:string):void {if(createWalletAccess(reader).getAccount(actor,id).permission!=='manage')fail(403,'Không có quyền quản lý tài khoản.');}
function hasAccountHistory(reader:WalletReader,id:string):boolean {
 if(reader.get('SELECT 1 AS present FROM wallet_postings WHERE account_id=? LIMIT 1',id))return true;
 // Moving the last posting must not erase its original currency provenance.
 // Older audit objects need not contain arrays or homogeneous element types.
 const side=(column:'before_json'|'after_json')=>"EXISTS(SELECT 1 FROM json_each(CASE WHEN json_type(m."+column+",'$.postings')='array' THEN json_extract(m."+column+",'$.postings') ELSE '[]' END) p WHERE json_extract(CASE WHEN p.type='object' THEN p.value ELSE '{}' END,'$.accountId')=?)";
 return !!reader.get('SELECT 1 AS present FROM wallet_audit_metadata m WHERE '+side('before_json')+' OR '+side('after_json')+' LIMIT 1',id,id);
}
/** Internal commands only. Explicit cutover must enable storage before wiring UI. */
export function createWalletAccounts(ports:{reader:WalletReader;write:typeof withAppWriteTransaction;now?:()=>number}){
 const store=openWalletStore({write:ports.write}),now=ports.now??Date.now;
 const stamp=()=>new Date(now()).toISOString();
 const run=<T>(ctx:CommandContext,command:string,value:unknown,fn:(tx:WalletTx)=>T)=>store.transaction({actorId:ctx.actor.userId,command:'wallet:account:'+command,requestId:ctx.idempotencyKey,payloadHash:createHash('sha256').update(JSON.stringify(value)).digest('hex')},fn);
 const audit=(tx:WalletTx,actor:Actor,action:string,at:string,before:WalletAccountResult|null,after:WalletAccountResult)=>{const id=randomUUID();tx.audit.append({id,recordId:null,actorId:actor.userId,action:'wallet:account:'+action});tx.metadata.audit.set({auditId:id,occurredAt:at,before:before===null?null:{...before},after:{...after}});};
 const grantTarget=(reader:WalletReader,id:string)=>{const raw=reader.legacy?reader.legacy.users.find(user=>user.id===id):reader.get('SELECT data FROM users WHERE id=?',id),user=reader.legacy?raw:raw?JSON.parse(raw.data):undefined;if(!user||user.id!==id||user.isDeleted||!['admin','member'].includes(user.role))fail(422,'Chỉ cấp quyền cho thành viên người lớn đang hoạt động.','wallet-grant-target');};
 const changeGrant=(ctx:CommandContext,id:string,userId:string,permission:WalletPermission|null,removing=false):WalletGrantResult=>{
  context(ctx,ports.reader,true);text(id,256);manager(ports.reader,ctx.actor,id);try{text(userId,256);if(!removing)choice(permission,['read','contribute','manage']);}catch{fail(422,'Quyền tài khoản không hợp lệ.','wallet-grant-invalid');}if(!removing)grantTarget(ports.reader,userId);
  return run(ctx,removing?'grant-remove':'grant-set',{id,userId,permission,expectedRevision:ctx.expectedRevision},tx=>{
   const reader=txReader(tx);context(ctx,reader,true);manager(reader,ctx.actor,id);if(!removing)grantTarget(reader,userId);const before=result(reader,ctx.actor,id);if(before.account.revision!==ctx.expectedRevision)fail(409,'Tài khoản vừa được thay đổi.','edit-conflict');const previous=tx.sql.get('SELECT permission FROM wallet_account_grants WHERE account_id=? AND user_id=?',id,userId)?.permission??null;
   if(previous===permission)return {accountId:id,revision:before.account.revision,grant:{userId,permission}};
   if(removing)tx.sql.run('DELETE FROM wallet_account_grants WHERE account_id=? AND user_id=?',id,userId);else tx.sql.run('INSERT INTO wallet_account_grants VALUES(?,?,?) ON CONFLICT(account_id,user_id) DO UPDATE SET permission=excluded.permission',id,userId,permission);
   tx.sql.run('UPDATE wallet_accounts SET revision=revision+1 WHERE id=?',id);const at=stamp();tx.metadata.accounts.set({...before.metadata,updatedAt:at,updatedBy:ctx.actor.userId});const saved:WalletGrantResult={accountId:id,revision:before.account.revision+1,grant:{userId,permission}},auditId=randomUUID();tx.audit.append({id:auditId,recordId:null,actorId:ctx.actor.userId,action:'wallet:account:'+(removing?'grant-remove':'grant-set')});tx.metadata.audit.set({auditId,occurredAt:at,before:{accountId:id,revision:before.account.revision,grant:{userId,permission:previous}},after:{...saved}});return saved;
  });
 };
 const balance=(actor:Actor,id:string,date:string,cleared:boolean):Money=>{
  assertWalletActor(ports.reader,actor);if(ports.reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1')fail(409,'Kho Wallet chưa được kích hoạt.','wallet-storage-inactive');parseEffectiveDate(date);
  const account=createWalletAccess(ports.reader).getAccount(actor,id);let total=date>=account.openingDate?minorInteger(account.openingMinor):0n;
  for(const row of ports.reader.all('SELECT CAST(p.delta_minor AS TEXT) AS minor FROM wallet_postings p JOIN wallet_records r ON r.id=p.record_id WHERE p.account_id=? AND p.effective_date<=? AND r.settlement_status '+(cleared?"IN('cleared','reconciled')":"!='voided'"),id,date))total+=minorInteger(row.minor);
  try{return {minor:minorInteger(total.toString()).toString(),currency:account.currency};}catch{fail(422,'Số dư vượt giới hạn signed64.','wallet-balance-limit');}
 };
 const readAccount=(actor:Actor,id:string):WalletAccountResult=>{assertWalletActor(ports.reader,actor);if(ports.reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1')fail(409,'Kho Wallet chưa được kích hoạt.','wallet-storage-inactive');return result(ports.reader,actor,id);};
 return {
  getAccount:readAccount,
  listGrants(actor:Actor,id:string):WalletAccountGrant[] {const value=readAccount(actor,id);if(value.account.permission!=='manage')fail(403,'Không có quyền quản lý tài khoản.');return ports.reader.all('SELECT account_id AS accountId,user_id AS userId,permission FROM wallet_account_grants WHERE account_id=? ORDER BY user_id',id);},
  setGrant(ctx:CommandContext,id:string,userId:string,permission:WalletPermission):WalletGrantResult {return changeGrant(ctx,id,userId,permission);},
  removeGrant(ctx:CommandContext,id:string,userId:string):WalletGrantResult {return changeGrant(ctx,id,userId,null,true);},
  createAccount(ctx:CommandContext,value:AccountDraft):WalletAccountResult {
   context(ctx,ports.reader);const v=draft(input(value));
   return run(ctx,'create',v,tx=>{const reader=txReader(tx);context(ctx,reader);const id=randomUUID(),at=stamp();tx.accounts.insert({id,name:v.name,type:v.type,currency:v.currency,ownerUserId:ctx.actor.userId,accessMode:v.accessMode,openingMinor:v.openingMinor,openingDate:v.openingDate,revision:1});tx.metadata.accounts.set({accountId:id,...settings(v),createdAt:at,updatedAt:at,createdBy:ctx.actor.userId,updatedBy:ctx.actor.userId});const saved=result(reader,ctx.actor,id);audit(tx,ctx.actor,'create',at,null,saved);return saved;});
  },
  updateAccount(ctx:CommandContext,id:string,value:AccountPatch):WalletAccountResult {
   context(ctx,ports.reader,true);text(id,256);manager(ports.reader,ctx.actor,id);const patch=input(value,true);if(patch.archived!==undefined){try{boolean(patch.archived);}catch{fail(422,'Giá trị lưu trữ tài khoản không hợp lệ.');}}const before=result(ports.reader,ctx.actor,id);draft({...before.account,...settings(before.metadata),...patch});
   return run(ctx,'update',{id,expectedRevision:ctx.expectedRevision,patch:normalized(patch)},tx=>{
    const reader=txReader(tx);context(ctx,reader,true);manager(reader,ctx.actor,id);const before=result(reader,ctx.actor,id);if(before.account.revision!==ctx.expectedRevision)fail(409,'Tài khoản vừa được thay đổi.','edit-conflict');
    const v=draft({...before.account,...settings(before.metadata),...patch});
    if(v.type!=='investment'&&reader.get("SELECT 1 FROM sqlite_master WHERE name='wallet_investment_trades' AND type='table'")&&reader.get('SELECT 1 FROM wallet_investment_trades WHERE account_id=? LIMIT 1',id))fail(409,'Tài khoản có lịch sử đầu tư cần giữ kiểu đầu tư.','wallet-investment-history');
    if(v.currency!==before.account.currency&&hasAccountHistory(reader,id))fail(409,'Không thể đổi tiền tệ của tài khoản đã có lịch sử.','wallet-currency-history');
    const at=stamp(),archivedAt=patch.archived===true?before.account.archivedAt??at:patch.archived===false?null:before.account.archivedAt;
    tx.sql.run('UPDATE wallet_accounts SET name=?,type=?,currency=?,access_mode=?,opening_minor=?,opening_date=?,revision=revision+1,archived_at=? WHERE id=?',v.name,v.type,v.currency,v.accessMode,minorInteger(v.openingMinor),v.openingDate,archivedAt,id);
    tx.metadata.accounts.set({...before.metadata,...settings(v),updatedAt:at,updatedBy:ctx.actor.userId});const saved=result(reader,ctx.actor,id);audit(tx,ctx.actor,'update',at,before,saved);return saved;
   });
  },
  getBookBalance(actor:Actor,id:string,date:string):Money{return balance(actor,id,date,false);},
  getClearedBalance(actor:Actor,id:string,date:string):Money{return balance(actor,id,date,true);},
  getCreditPosition(actor:Actor,id:string,date:string):WalletCreditPosition {
   const book=balance(actor,id,date,false),metadata=result(ports.reader,actor,id).metadata,n=minorInteger(book.minor),limit=metadata.creditLimitMinor===null?null:minorInteger(metadata.creditLimitMinor);
   try{const debtMinor=minorInteger((n<0n?-n:0n).toString()).toString(),availableMinor=limit===null?null:minorInteger((limit+n).toString()).toString();return {currency:book.currency,bookMinor:book.minor,creditLimitMinor:metadata.creditLimitMinor,debtMinor,availableMinor,utilization:limit!==null&&limit>0n?{numerator:debtMinor,denominator:limit.toString()}:null};}catch{fail(422,'Vị thế tín dụng vượt giới hạn signed64.','wallet-balance-limit');}
  },
 };
}
