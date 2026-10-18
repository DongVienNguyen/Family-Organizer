import {markManualRuleChanges} from './ruleOverrides.js';
import {allocationRows,assertAllocationTotal,type AllocationDraft} from '../../src/features/wallet/allocations.js';
import {createHash,randomUUID} from 'node:crypto';
import type {Actor,CommandContext,Money,Settlement} from '../../src/features/wallet/contracts.js';
import {object,keys,text,choice} from '../../src/features/productivity/validation.js';
import {assertMoney,minorInteger,convertMoney} from '../../src/features/wallet/money.js';
import {utcInstant} from '../../src/features/productivity/dates.js';
import {effectiveDateAt} from '../../src/features/wallet/dates.js';
import {parseEffectiveDate} from '../../src/features/wallet/dates.js';
import {assertTimezone} from '../../src/features/productivity/dates.js';
import {AppStoreError} from '../appErrors.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {assertWalletCommandContext} from './accounts.js';
import {createWalletAccess,assertWalletActor,type WalletReader} from './access.js';
import {openWalletStore,type WalletTx,type WalletRecord,type WalletPosting} from './store.js';
import {walletMetadataColumns,decodeMetadata,validateMetadata,type WalletRecordMetadata} from './metadata.js';
import type {WalletFxSnapshot} from './financial.js';
interface CommonDraft {allocations?:AllocationDraft[];effectiveDate:string;timezone:string;note?:string;occurredAt?:string|null;payee?:string;paymentMethod?:string;reviewedAt?:string|null;settlementStatus?:Exclude<Settlement,'voided'>;categoryId?:string|null;labelIds?:string[]}
interface FxDraft {numerator:string;denominator:string;asOf?:string}
interface FeeDraft {accountId:string;money:Money;note?:string;categoryId?:string|null}
export type RecordDraft=CommonDraft&({kind:'income'|'expense'|'adjustment';accountId:string;money:Money}|{kind:'transfer';fromAccountId:string|null;toAccountId:string|null;debit:Money;credit:Money;fx?:FxDraft|null;fee?:FeeDraft|null});
export type RecordPatch=Partial<CommonDraft>&{kind?:RecordDraft['kind'];accountId?:string;money?:Money;fromAccountId?:string|null;toAccountId?:string|null;debit?:Money;credit?:Money;fx?:FxDraft|null;fee?:FeeDraft|null};
export interface WalletRecordResult {allocations?:AllocationDraft[];record:WalletRecord;metadata:WalletRecordMetadata;postings:WalletPosting[];fx:WalletFxSnapshot|null;feeRecordId:string|null;labelIds:string[]}
export interface WalletAllocationResult {recordId:string;revision:number;rows:AllocationDraft[]}
export interface WalletRecordActions {recordId:string;canEdit:boolean;canVoid:boolean;editViaTransferId?:string}
type Draft=RecordDraft&Required<CommonDraft>;
const commonFields=['allocations','effectiveDate','timezone','note','occurredAt','payee','paymentMethod','reviewedAt','settlementStatus','categoryId','labelIds'];
const singleFields=['kind','accountId','money'],transferFields=['kind','fromAccountId','toAccountId','debit','credit','fx','fee'];
const fail=(status:number,message:string,code='wallet-record'):never=>{throw new AppStoreError(message,status,code);};
const txReader=(tx:WalletTx):WalletReader=>({...tx.sql,get legacy(){return tx.legacy;}});
function payload(value:unknown,allowed:string[]):Record<string,unknown>{try{const v=object(value);keys(v,allowed);if(Object.values(v).some(x=>x===undefined))throw Error();return structuredClone(v);}catch{fail(400,'Trường giao dịch không hợp lệ.');}}
function amount(value:unknown,signed=false):Money {assertMoney(value);const n=minorInteger(value.minor);if(n===0n||!signed&&n<0n)throw Error('Invalid record amount');return {minor:value.minor,currency:value.currency};}
function normalize(value:unknown):Draft {
 const raw=object(value);choice(raw.kind,['income','expense','adjustment','transfer']);const v=payload(value,[...commonFields,...(raw.kind==='transfer'?transferFields:singleFields)]);
 try{
  text(v.effectiveDate,10);parseEffectiveDate(v.effectiveDate);text(v.timezone,100);assertTimezone(v.timezone);const note=v.note===undefined?'':v.note; text(note,100000,false);
  const metadata={recordId:'validation-only',occurredAt:v.occurredAt===undefined?null:v.occurredAt,payee:v.payee===undefined?'':v.payee,paymentMethod:v.paymentMethod===undefined?'':v.paymentMethod,reviewedAt:v.reviewedAt===undefined?null:v.reviewedAt,createdAt:null,updatedAt:null,createdBy:null,updatedBy:null};validateMetadata('wallet_record_metadata',metadata);
  const settlementStatus=v.settlementStatus===undefined?'cleared':v.settlementStatus;choice(settlementStatus,['uncleared','cleared','reconciled']);const categoryId=v.categoryId===undefined?null:v.categoryId;if(categoryId!==null)text(categoryId,256);
  const labelIds=v.labelIds===undefined?[]:v.labelIds;if(!Array.isArray(labelIds)||labelIds.length>20||new Set(labelIds).size!==labelIds.length)throw Error('Invalid labels');for(const id of labelIds)text(id,256);
  const allocations=v.allocations===undefined?undefined:allocationRows(v.allocations);
  const common={...(allocations===undefined?{}:{allocations}),effectiveDate:v.effectiveDate,timezone:v.timezone,note,occurredAt:metadata.occurredAt,payee:metadata.payee,paymentMethod:metadata.paymentMethod,reviewedAt:metadata.reviewedAt,settlementStatus,categoryId,labelIds:[...labelIds].sort()};
  if(v.kind!=='transfer'){text(v.accountId,256);const result={...common,kind:v.kind,accountId:v.accountId,money:amount(v.money,v.kind==='adjustment')} as Draft;if(allocations)assertAllocationTotal(allocations,result,plannedPostings('draft-only',result));return result;}
  for(const key of ['fromAccountId','toAccountId'])if(v[key]!==null)text(v[key],256);if(v.fromAccountId===null&&v.toAccountId===null||v.fromAccountId===v.toAccountId)throw Error('Invalid transfer endpoints');
  const debit=amount(v.debit),credit=amount(v.credit);let fx:FxDraft|null=null;
  if(debit.currency===credit.currency){if(debit.minor!==credit.minor||v.fx!==undefined&&v.fx!==null)throw Error('Invalid same-currency transfer');}
  else{const r=object(v.fx);keys(r,['numerator','denominator','asOf']);fx={numerator:r.numerator as string,denominator:r.denominator as string,asOf:r.asOf===undefined?v.effectiveDate:r.asOf as string};text(fx.asOf,10);parseEffectiveDate(fx.asOf);if(convertMoney(debit,credit.currency,fx).minor!==credit.minor)throw Error('FX mismatch');}
  let fee:FeeDraft|null=null;if(v.fee!==undefined&&v.fee!==null){const r=payload(v.fee,['accountId','money','note','categoryId']);text(r.accountId,256);const note=r.note===undefined?'':r.note;text(note,100000,false);const categoryId=r.categoryId===undefined?null:r.categoryId;if(categoryId!==null)text(categoryId,256);fee={accountId:r.accountId,money:amount(r.money),note,categoryId} as FeeDraft;}
  const result={...common,kind:'transfer',fromAccountId:v.fromAccountId,toAccountId:v.toAccountId,debit,credit,fx,fee} as Draft;if(allocations)assertAllocationTotal(allocations,result,plannedPostings('draft-only',result));return result;
 }catch(error){if(error instanceof AppStoreError)throw error;fail(422,'Giá trị giao dịch không hợp lệ.');}
}
function targets(draft:Draft):{accountId:string;money:Money;fee?:boolean}[]{return draft.kind==='transfer'?[...(draft.fromAccountId===null?[]:[{accountId:draft.fromAccountId,money:draft.debit}]),...(draft.toAccountId===null?[]:[{accountId:draft.toAccountId,money:draft.credit}]),...(draft.fee?[{accountId:draft.fee.accountId,money:draft.fee.money,fee:true}]:[])]:[{accountId:draft.accountId,money:draft.money}];}
function checkTargets(reader:WalletReader,actor:Actor,draft:Draft,options:{archive?:boolean;previous?:Set<string>;previousFee?:Set<string>;otherCreator?:boolean}={}):void {
 const access=createWalletAccess(reader);for(const target of targets(draft)){const account=access.getAccount(actor,target.accountId);if(account.permission==='read'||options.otherCreator&&account.permission!=='manage')fail(403,'Không có quyền ghi vào tài khoản.');if(account.currency!==target.money.currency)fail(422,'Tiền tệ không khớp tài khoản.');if(options.archive&&account.archivedAt!==null&&!(target.fee?options.previousFee:options.previous)?.has(account.id))fail(409,'Tài khoản đã được lưu trữ.','wallet-account-archived');}
}
export function checkWalletCatalog(reader:WalletReader,id:string|null,labels:string[],before?:{record:{categoryId?:string};labelIds:string[]}):void {
 if(id!==null&&id!==before?.record.categoryId){const seen=new Set<string>();let next:string|null=id;while(next!==null){if(seen.has(next))fail(422,'Danh mục có vòng lặp.');seen.add(next);const row=reader.get('SELECT c.parent_id,c.archived_at,m.hidden FROM wallet_categories c LEFT JOIN wallet_category_metadata m ON m.category_id=c.id WHERE c.id=?',next);if(!row||row.archived_at!==null||row.hidden===1)fail(422,'Danh mục không thể được chọn.');next=row.parent_id;}}
 for(const label of labels)if(!before?.labelIds.includes(label)){const row=reader.get('SELECT l.archived_at,m.hidden FROM wallet_labels l LEFT JOIN wallet_label_metadata m ON m.label_id=l.id WHERE l.id=?',label);if(!row||row.archived_at!==null||row.hidden===1)fail(422,'Nhãn không thể được chọn.');}
}
export {normalize as normalizeWalletRecordDraft};
/** Validate a prospective new manual draft without writing a record. */
export function validateWalletRecordDraft(reader:WalletReader,actor:Actor,raw:unknown):RecordDraft {
 const guard=()=>{assertWalletActor(reader,actor);if(reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1')fail(409,'Wallet chưa sẵn sàng.');};guard();const value=normalize(raw);checkTargets(reader,actor,value,{archive:true});checkWalletCatalog(reader,value.categoryId,value.labelIds);for(const row of value.allocations??[])checkWalletCatalog(reader,row.categoryId,[]);if(value.kind==='transfer'&&value.fee)checkWalletCatalog(reader,value.fee.categoryId??null,[]);guard();return value;
}
function result(reader:WalletReader,actor:Actor,id:string):WalletRecordResult {
 const value=createWalletAccess(reader).getRecord(actor,id);if(value.partial)fail(404,'Không tìm thấy giao dịch có thể sửa.');const columns=walletMetadataColumns.wallet_record_metadata,row=reader.get('SELECT '+columns.join(',')+' FROM wallet_record_metadata WHERE record_id=?',id);if(!row)fail(409,'Thiếu metadata giao dịch.');
 let allocations:AllocationDraft[];try{allocations=allocationRows(reader.all('SELECT category_id AS categoryId,CAST(amount_minor AS TEXT) AS amountMinor FROM wallet_allocations WHERE record_id=? ORDER BY category_id LIMIT 101',id));assertAllocationTotal(allocations,value.record,value.postings);}catch{fail(422,'Phân bổ lịch sử không khớp giao dịch.');}
 return {...(allocations.length?{allocations}:{}),record:value.record,metadata:decodeMetadata('wallet_record_metadata',row) as unknown as WalletRecordMetadata,postings:value.postings.map(({currency:_currency,...posting})=>posting),fx:reader.get('SELECT record_id AS recordId,from_currency AS fromCurrency,to_currency AS toCurrency,CAST(debit_minor AS TEXT) AS debitMinor,CAST(credit_minor AS TEXT) AS creditMinor,rate_numerator AS numerator,rate_denominator AS denominator,as_of AS asOf,source FROM wallet_record_fx WHERE record_id=?',id)??null,feeRecordId:reader.get('SELECT fee_record_id AS id FROM wallet_transfer_fees WHERE transfer_record_id=?',id)?.id??null,labelIds:reader.all('SELECT label_id AS id FROM wallet_record_labels WHERE record_id=? ORDER BY label_id',id).map(row=>row.id)};
}
function authorize(reader:WalletReader,actor:Actor,id:string,allowFinancialLink=false):void {
 if(!allowFinancialLink&&reader.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wallet_financial_links'")&&reader.get("SELECT 1 FROM wallet_financial_links WHERE state='active' AND(record_id=? OR interest_record_id=?)",id,id))fail(409,'Cần quy trình sửa khoản trả nợ hoặc góp mục tiêu.','wallet-financial-link');
 const access=createWalletAccess(reader);access.authorizeRecord(actor,id,'write');if(reader.get('SELECT 1 AS linked FROM wallet_transfer_fees WHERE fee_record_id=?',id))fail(409,'Sửa phí thông qua giao dịch chuyển khoản.','wallet-linked-fee');const fee=reader.get('SELECT fee_record_id AS id FROM wallet_transfer_fees WHERE transfer_record_id=?',id);if(fee)access.authorizeRecord(actor,fee.id,'write');
}
function asDraft(reader:WalletReader,actor:Actor,value:WalletRecordResult):RecordDraft {
 const {record:r,metadata:m}=value,common={...(value.allocations?{allocations:value.allocations}:{}),effectiveDate:r.effectiveDate,timezone:r.timezone,note:r.note,occurredAt:m.occurredAt,payee:m.payee,paymentMethod:m.paymentMethod,reviewedAt:m.reviewedAt,settlementStatus:r.settlementStatus as Exclude<Settlement,'voided'>,categoryId:r.categoryId??null,labelIds:value.labelIds};
 if(r.kind==='trade')return fail(409,'Giao dịch đầu tư cần trình chỉnh sửa chuyên biệt.');
 if(r.kind!=='transfer'){const p=value.postings[0];if(value.postings.length!==1)fail(409,'Cấu trúc giao dịch không thể chỉnh sửa.');const n=minorInteger(p.deltaMinor);return {...common,kind:r.kind,accountId:p.accountId,money:{minor:(r.kind==='expense'?-n:n).toString(),currency:createWalletAccess(reader).getAccount(actor,p.accountId).currency}};}
 const outgoing=value.postings.find(p=>minorInteger(p.deltaMinor)<0n),incoming=value.postings.find(p=>minorInteger(p.deltaMinor)>0n),one=outgoing??incoming;if(!one)fail(409,'Thiếu posting chuyển khoản.');const currency=createWalletAccess(reader).getAccount(actor,one.accountId).currency;
 const debit=value.fx?{minor:value.fx.debitMinor,currency:value.fx.fromCurrency}:{minor:(outgoing?-minorInteger(outgoing.deltaMinor):minorInteger(incoming!.deltaMinor)).toString(),currency},credit=value.fx?{minor:value.fx.creditMinor,currency:value.fx.toCurrency}:{...debit};
 let fee:FeeDraft|null=null;if(value.feeRecordId){const valueFee=result(reader,actor,value.feeRecordId),p=valueFee.postings[0];fee={accountId:p.accountId,money:{minor:(-minorInteger(p.deltaMinor)).toString(),currency:createWalletAccess(reader).getAccount(actor,p.accountId).currency},note:valueFee.record.note,categoryId:valueFee.record.categoryId??null};}
 return {...common,kind:'transfer',fromAccountId:outgoing?.accountId??null,toAccountId:incoming?.accountId??null,debit,credit,fx:value.fx?{numerator:value.fx.numerator,denominator:value.fx.denominator,asOf:value.fx.asOf}:null,fee};
}
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,canonical(value)])):v;
function auditState(value:WalletRecordResult):Record<string,unknown>{const {note,...record}=value.record,{payee,paymentMethod,...metadata}=value.metadata;return {...(value.allocations?{allocations:value.allocations}:{}),record,metadata,postings:value.postings,fx:value.fx,feeRecordId:value.feeRecordId,labelIds:value.labelIds,textDigests:Object.fromEntries(Object.entries({note,payee,paymentMethod}).map(([key,text])=>[key,{length:text.length,sha256:createHash('sha256').update(text).digest('hex')}]))};}
export {auditState as walletRecordAuditState};
/** Only I01 writes; no lifecycle, provider, HTTP or legacy cutover on import. */
export function createWalletRecords(ports:{reader:WalletReader;write:typeof withAppWriteTransaction;now?:()=>number}){
 const store=openWalletStore({write:ports.write}),now=ports.now??Date.now;
 const context=(ctx:CommandContext,reader:WalletReader,editing=false)=>{assertWalletCommandContext(ctx,reader,editing);if(!reader.get("SELECT name FROM sqlite_master WHERE name='wallet_record_fx' AND type='table'"))fail(409,'Cần nâng cấp schema Wallet.','wallet-storage-inactive');};
 const run=<T>(ctx:CommandContext,command:string,input:unknown,fn:(tx:WalletTx)=>T)=>store.transaction({actorId:ctx.actor.userId,command:'wallet:record:'+command,requestId:ctx.idempotencyKey,payloadHash:createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex')},fn);
 const audit=(tx:WalletTx,actor:Actor,action:string,at:string,before:WalletRecordResult|null,after:WalletRecordResult)=>{const id=randomUUID();tx.audit.append({id,recordId:after.record.id,actorId:actor.userId,action:'wallet:record:'+action});tx.metadata.audit.set({auditId:id,occurredAt:at,before:before?auditState(before):null,after:auditState(after)});};
 const apply=(tx:WalletTx,actor:Actor,draft:Draft,at:string,before?:WalletRecordResult,provenance?:{source:'import';externalKey:string}|{source:'schedule'}):WalletRecordResult=>{
  const reader=txReader(tx),id=before?.record.id??randomUUID();checkWalletCatalog(reader,draft.categoryId,draft.labelIds,before);
  if(before){if(before.record.occurrenceId)fail(409,'Cần quy trình sửa giao dịch định kỳ.');if(draft.allocations===undefined&&tx.sql.get('SELECT 1 AS present FROM wallet_allocations WHERE record_id=? LIMIT 1',id)&&JSON.stringify(before.postings)!==JSON.stringify(plannedPostings(id,draft)))fail(409,'Cần quy trình sửa phân bổ.');tx.sql.run('DELETE FROM wallet_record_fx WHERE record_id=?',id);tx.sql.run('DELETE FROM wallet_postings WHERE record_id=?',id);tx.sql.run('UPDATE wallet_records SET kind=?,effective_date=?,timezone=?,note=?,settlement_status=?,revision=revision+1,category_id=? WHERE id=?',draft.kind,draft.effectiveDate,draft.timezone,draft.note,draft.settlementStatus,draft.categoryId,id);}
  else tx.records.insert({id,kind:draft.kind,effectiveDate:draft.effectiveDate,timezone:draft.timezone,source:provenance?.source??'manual',...(provenance&&'externalKey'in provenance?{externalKey:provenance.externalKey}:{}),note:draft.note,settlementStatus:draft.settlementStatus,creatorId:actor.userId,revision:1,...(draft.categoryId===null?{}:{categoryId:draft.categoryId})});
  for(const posting of plannedPostings(id,draft))tx.postings.insert(posting);
  if(draft.allocations!==undefined){if(!reader.get("SELECT name FROM sqlite_master WHERE name='wallet_templates' AND type='table'"))fail(409,'Cần schema Wallet7 để dùng phân bổ.');const retained=new Set(before?.allocations?.map(row=>row.categoryId)??[]);for(const row of draft.allocations)checkWalletCatalog(reader,row.categoryId,[],retained.has(row.categoryId)?{record:{categoryId:row.categoryId},labelIds:[]}:undefined);tx.sql.run('DELETE FROM wallet_allocations WHERE record_id=?',id);for(const row of draft.allocations)tx.sql.run('INSERT INTO wallet_allocations VALUES(?,?,?)',id,row.categoryId,minorInteger(row.amountMinor));}

  tx.metadata.records.set({recordId:id,occurredAt:draft.occurredAt,payee:draft.payee,paymentMethod:draft.paymentMethod,reviewedAt:draft.reviewedAt,createdAt:before?before.metadata.createdAt:at,createdBy:before?before.metadata.createdBy:actor.userId,updatedAt:at,updatedBy:actor.userId});tx.sql.run('DELETE FROM wallet_record_labels WHERE record_id=?',id);for(const label of draft.labelIds)tx.sql.run('INSERT INTO wallet_record_labels VALUES(?,?)',id,label);
  if(draft.kind==='transfer'&&draft.fx){const fx={recordId:id,fromCurrency:draft.debit.currency,toCurrency:draft.credit.currency,debitMinor:draft.debit.minor,creditMinor:draft.credit.minor,numerator:draft.fx.numerator,denominator:draft.fx.denominator,asOf:draft.fx.asOf??draft.effectiveDate,source:'manual'},prior=before?.fx;if(prior&&prior.fromCurrency===fx.fromCurrency&&prior.toCurrency===fx.toCurrency&&prior.numerator===fx.numerator&&prior.denominator===fx.denominator&&prior.asOf===fx.asOf)fx.source=prior.source;tx.financial.fx.insert(fx);}
  markManualRuleChanges(tx.sql,id,before?{categoryId:before.record.categoryId??null,labelIds:before.labelIds,reviewedAt:before.metadata.reviewedAt}:null,{categoryId:draft.categoryId,labelIds:draft.labelIds,reviewedAt:draft.reviewedAt});
  return result(reader,actor,id);
 };
 const voidWithin=(tx:WalletTx,actor:Actor,before:WalletRecordResult,at:string)=>{if(before.record.occurrenceId)fail(409,'Cần quy trình hủy giao dịch định kỳ.');tx.sql.run("UPDATE wallet_records SET settlement_status='voided',revision=revision+1 WHERE id=?",before.record.id);tx.metadata.records.set({...before.metadata,updatedAt:at,updatedBy:actor.userId});const after=result(txReader(tx),actor,before.record.id);audit(tx,actor,'void',at,before,after);return after;};
 const feeDraft=(parent:Draft,fee:FeeDraft):Draft=>normalize({effectiveDate:parent.effectiveDate,timezone:parent.timezone,note:fee.note??'',kind:'expense',accountId:fee.accountId,money:fee.money,categoryId:fee.categoryId??null,payee:parent.payee,paymentMethod:parent.paymentMethod,settlementStatus:parent.settlementStatus,occurredAt:parent.occurredAt,reviewedAt:parent.reviewedAt});
 const setFee=(tx:WalletTx,actor:Actor,parent:WalletRecordResult,draft:Draft,at:string,before?:WalletRecordResult,explicitFee=true,source?:'schedule')=>{
  const reader=txReader(tx),old=before?.feeRecordId?result(reader,actor,before.feeRecordId):undefined;
  if(draft.kind==='transfer'&&draft.fee){
   if(old?.record.settlementStatus==='voided'){if(explicitFee)fail(409,'Gỡ phí đã hủy trước khi thêm khoản phí mới.','wallet-voided-fee');return result(reader,actor,parent.record.id);}
   const prior=old?asDraft(reader,actor,old):undefined,fee=old?normalize({...prior,accountId:draft.fee.accountId,money:draft.fee.money,note:draft.fee.note??old.record.note,categoryId:draft.fee.categoryId??null}):feeDraft(draft,draft.fee);
   if(prior&&JSON.stringify(canonical(prior))===JSON.stringify(canonical(fee)))return result(reader,actor,parent.record.id);
   const after=apply(tx,actor,fee,at,old,source?{source}:undefined);if(!old)tx.financial.fees.link(parent.record.id,after.record.id);audit(tx,actor,old?'update':'create',at,old??null,after);
  }
  else if(old){if(old.record.settlementStatus!=='voided')voidWithin(tx,actor,old,at);tx.sql.run('DELETE FROM wallet_transfer_fees WHERE transfer_record_id=?',parent.record.id);}
  return result(reader,actor,parent.record.id);
 };
 return {
  /** The financial-link coordinator owns both legacy history and these records
   * in this same I01 transaction. These ports are never exposed as HTTP drafts. */
  createFinancialWithin(tx:WalletTx,ctx:CommandContext,raw:RecordDraft):WalletRecordResult {
   const reader=txReader(tx);context({...ctx,expectedRevision:0},reader);const draft=normalize(raw);if(!['income','expense','transfer'].includes(draft.kind))fail(422,'Dòng tiền liên kết không hợp lệ.');checkTargets(reader,ctx.actor,draft,{archive:true});const at=new Date(now()).toISOString();let saved=apply(tx,ctx.actor,draft,at);audit(tx,ctx.actor,'financial-create',at,null,saved);saved=setFee(tx,ctx.actor,saved,draft,at);return saved;
  },
  replaceFinancialWithin(tx:WalletTx,ctx:CommandContext,id:string,revision:number,raw:RecordDraft):WalletRecordResult {
   const reader=txReader(tx);context({...ctx,expectedRevision:revision},reader,true);authorize(reader,ctx.actor,id,true);const before=result(reader,ctx.actor,id);if(before.record.revision!==revision||before.record.settlementStatus==='voided'||before.record.occurrenceId||before.record.kind==='trade')fail(409,'Bản ghi liên kết vừa thay đổi.','edit-conflict');const draft=normalize(raw);if(!['income','expense','transfer'].includes(draft.kind))fail(422,'Dòng tiền liên kết không hợp lệ.');checkTargets(reader,ctx.actor,draft,{archive:true});const at=new Date(now()).toISOString();let saved=apply(tx,ctx.actor,draft,at,before);audit(tx,ctx.actor,'financial-update',at,before,saved);saved=setFee(tx,ctx.actor,saved,draft,at,before);return saved;
  },
  markFinancialWithin(tx:WalletTx,ctx:CommandContext,id:string,revision:number):WalletRecordResult {
   const reader=txReader(tx);context({...ctx,expectedRevision:revision},reader,true);authorize(reader,ctx.actor,id);const before=result(reader,ctx.actor,id);if(before.record.revision!==revision||before.record.settlementStatus==='voided'||before.record.occurrenceId)fail(409,'Bản ghi liên kết vừa thay đổi.','edit-conflict');const at=new Date(now()).toISOString();tx.sql.run('UPDATE wallet_records SET revision=revision+1 WHERE id=?',id);tx.metadata.records.set({...before.metadata,updatedAt:at,updatedBy:ctx.actor.userId});const saved=result(reader,ctx.actor,id);audit(tx,ctx.actor,'financial-link',at,before,saved);return saved;
  },
  voidFinancialWithin(tx:WalletTx,ctx:CommandContext,id:string):WalletRecordResult {
   const reader=txReader(tx);context({...ctx,expectedRevision:1},reader,true);authorize(reader,ctx.actor,id,true);const before=result(reader,ctx.actor,id);if(before.record.settlementStatus==='voided'||before.record.occurrenceId)fail(409,'Bản ghi liên kết không thể hủy riêng.');const at=new Date(now()).toISOString(),saved=voidWithin(tx,ctx.actor,before,at);if(before.feeRecordId){const fee=result(reader,ctx.actor,before.feeRecordId);if(fee.record.settlementStatus!=='voided')voidWithin(tx,ctx.actor,fee,at);}return saved;
  },
  /** Trusted import coordinator only: caller already owns the installation I01
   * transaction. HTTP record payloads still cannot supply provenance. */
  createImportedWithin(tx:WalletTx,ctx:CommandContext,raw:RecordDraft,externalKey:string):WalletRecordResult {
   const reader=txReader(tx);context({...ctx,expectedRevision:0},reader);text(externalKey,256);const draft=normalize(raw);if(!['income','expense'].includes(draft.kind))fail(422,'Bản nhập cần giao dịch thu/chi rõ ràng.');checkTargets(reader,ctx.actor,draft,{archive:true});const at=new Date(now()).toISOString(),saved=apply(tx,ctx.actor,draft,at,undefined,{source:'import',externalKey});audit(tx,ctx.actor,'import',at,null,saved);return saved;
  },
  /** Trusted occurrence coordinator only. Public drafts still cannot choose a
   * source or occurrence. The outer I01 command owns the occurrence transition. */
  createScheduledWithin(tx:WalletTx,ctx:CommandContext,raw:RecordDraft,occurrenceId:string):WalletRecordResult {
   const reader=txReader(tx);context({...ctx,expectedRevision:0},reader);text(occurrenceId,256);const slot=reader.get('SELECT o.due_date,m.owner_id,m.state FROM wallet_occurrences o JOIN wallet_occurrence_metadata m ON m.occurrence_id=o.id WHERE o.id=?',occurrenceId);
   if(!slot||slot.owner_id!==ctx.actor.userId)fail(404,'Không tìm thấy kỳ định kỳ.');if(slot.state!=='pending'||reader.get('SELECT 1 FROM wallet_records WHERE occurrence_id=?',occurrenceId))fail(409,'Kỳ định kỳ đã được xác nhận.');const draft=normalize(raw);if(!['income','expense','transfer'].includes(draft.kind)||draft.effectiveDate!==slot.due_date)fail(422,'Nội dung kỳ định kỳ không hợp lệ.');checkTargets(reader,ctx.actor,draft,{archive:true});const at=new Date(now()).toISOString(),parent=apply(tx,ctx.actor,draft,at,undefined,{source:'schedule'});setFee(tx,ctx.actor,parent,draft,at,undefined,true,'schedule');tx.sql.run('UPDATE wallet_records SET occurrence_id=? WHERE id=?',occurrenceId,parent.record.id);const saved=result(reader,ctx.actor,parent.record.id);audit(tx,ctx.actor,'schedule',at,null,saved);return saved;
  },
  linkScheduledWithin(tx:WalletTx,ctx:CommandContext,id:string,revision:number,occurrenceId:string,raw:RecordDraft):WalletRecordResult {
   const reader=txReader(tx);context(ctx,reader,true);text(id,256);text(occurrenceId,256);const slot=reader.get('SELECT m.owner_id,m.state FROM wallet_occurrences o JOIN wallet_occurrence_metadata m ON m.occurrence_id=o.id WHERE o.id=?',occurrenceId);if(!slot||slot.owner_id!==ctx.actor.userId)fail(404,'Không tìm thấy kỳ định kỳ.');if(slot.state!=='pending')fail(409,'Kỳ định kỳ đã được xử lý.');authorize(reader,ctx.actor,id);const before=result(reader,ctx.actor,id),draft=normalize(raw);
   if(!Number.isSafeInteger(revision)||before.record.revision!==revision||before.record.revision>=Number.MAX_SAFE_INTEGER||before.record.occurrenceId||before.record.settlementStatus==='voided'||before.record.kind!==draft.kind)fail(409,'Giao dịch không khớp kỳ định kỳ.','edit-conflict');
   const matches=(actual:WalletPosting[],expected:WalletPosting[])=>{const map=new Map(actual.map(p=>[p.accountId,p.deltaMinor]));return actual.length===expected.length&&expected.every(p=>map.get(p.accountId)===p.deltaMinor);};
   if(!matches(before.postings,plannedPostings(id,draft)))fail(409,'Tài khoản hoặc số tiền không khớp kỳ định kỳ.');
   if(draft.kind==='transfer'&&draft.fee){if(!before.feeRecordId)fail(409,'Phí chuyển khoản không khớp.');authorize(reader,ctx.actor,before.feeRecordId);const fee=result(reader,ctx.actor,before.feeRecordId);if(fee.record.settlementStatus==='voided'||!matches(fee.postings,[{recordId:fee.record.id,accountId:draft.fee.accountId,deltaMinor:(-minorInteger(draft.fee.money.minor)).toString()}]))fail(409,'Phí chuyển khoản không khớp.');}else if(before.feeRecordId)fail(409,'Giao dịch có phí ngoài cấu hình kỳ định kỳ.');
   const at=new Date(now()).toISOString();tx.sql.run('UPDATE wallet_records SET occurrence_id=?,revision=revision+1 WHERE id=?',occurrenceId,id);tx.metadata.records.set({...before.metadata,updatedAt:at,updatedBy:ctx.actor.userId});const saved=result(reader,ctx.actor,id);audit(tx,ctx.actor,'schedule-link',at,before,saved);return saved;
  },
  canUndoImportedWithin(tx:WalletTx,ctx:CommandContext,id:string,revision:number,externalKey:string):boolean {
   const reader=txReader(tx);context(ctx,reader,true);try{authorize(reader,ctx.actor,id);const before=result(reader,ctx.actor,id);if(before.record.creatorId!==ctx.actor.userId||before.record.source!=='import'||before.record.externalKey!==externalKey||before.record.revision!==revision||before.record.settlementStatus==='voided'||before.record.occurrenceId||before.feeRecordId||!['income','expense'].includes(before.record.kind))return false;
    // Unknown future financial links require an explicit undo policy. Ordinary
    // record metadata/audit/selection links do not own another ledger entry.
    const safe=new Set(['wallet_postings','wallet_record_metadata','wallet_record_labels','wallet_allocations','wallet_record_fx','wallet_audit','wallet_receipts','wallet_selection_records','wallet_rule_preview_rows','wallet_rule_overrides','wallet_import_entries']);
    for(const row of reader.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'wallet_%'")){if(safe.has(row.name)||!/^wallet_[a-z_]+$/.test(row.name))continue;for(const fk of reader.all('PRAGMA foreign_key_list('+row.name+')'))if(fk.table==='wallet_records'&&/^[a-z_]+$/.test(fk.from)&&reader.get('SELECT 1 AS linked FROM '+row.name+' WHERE '+fk.from+'=? LIMIT 1',id))return false;}
    return true;
   }catch(error){if(error instanceof AppStoreError&&[403,404,409].includes(error.status))return false;throw error;}
  },
  undoImportedWithin(tx:WalletTx,ctx:CommandContext,id:string,revision:number,externalKey:string):WalletRecordResult {
   if(!this.canUndoImportedWithin(tx,ctx,id,revision,externalKey))fail(409,'Giao dịch nhập đã thay đổi hoặc có liên kết.','CONFLICT');const before=result(txReader(tx),ctx.actor,id),at=new Date(now()).toISOString();tx.sql.run('UPDATE wallet_records SET external_key=NULL WHERE id=?',id);return voidWithin(tx,ctx.actor,before,at);
  },
  getAllocations(actor:Actor,id:string):WalletAllocationResult {
   const reader=ports.reader,guard=()=>{assertWalletActor(reader,actor);if(reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1'||!reader.get("SELECT name FROM sqlite_master WHERE name='wallet_templates' AND type='table'"))fail(409,'Cần schema Wallet7 để dùng phân bổ.');};guard();const before=result(reader,actor,id);
   const readRows=()=>{try{return allocationRows(reader.all('SELECT category_id AS categoryId,CAST(amount_minor AS TEXT) AS amountMinor FROM wallet_allocations WHERE record_id=? ORDER BY category_id LIMIT 101',id));}catch{fail(422,'Phân bổ lịch sử cần được xử lý trước khi sử dụng.');}},rows=readRows();try{assertAllocationTotal(rows,before.record,before.postings);}catch{fail(422,'Tổng phân bổ lịch sử không khớp giao dịch.');}guard();const after=result(reader,actor,id);if(after.record.revision!==before.record.revision||JSON.stringify(readRows())!==JSON.stringify(rows))fail(409,'Giao dịch hoặc phân bổ vừa thay đổi.');return {recordId:id,revision:before.record.revision,rows};
  },
  setAllocations(ctx:CommandContext,id:string,raw:AllocationDraft[],onChanged?:()=>void):WalletAllocationResult {
   const supported=(reader:WalletReader)=>{if(!reader.get("SELECT name FROM sqlite_master WHERE name='wallet_templates' AND type='table'"))fail(409,'Cần schema Wallet7 để dùng phân bổ.');};context(ctx,ports.reader,true);supported(ports.reader);text(id,256);authorize(ports.reader,ctx.actor,id);let rows:AllocationDraft[];try{rows=allocationRows(raw);}catch{fail(422,'Phân bổ không hợp lệ.');}
   return run(ctx,'allocations',{id,expectedRevision:ctx.expectedRevision,rows},tx=>{const reader=txReader(tx);context(ctx,reader,true);supported(reader);authorize(reader,ctx.actor,id);const before=result(reader,ctx.actor,id);if(before.record.revision!==ctx.expectedRevision||before.record.revision>=Number.MAX_SAFE_INTEGER)fail(409,'Giao dịch vừa thay đổi.','edit-conflict');if(before.record.settlementStatus==='voided'||before.record.occurrenceId)fail(409,'Giao dịch đã hủy hoặc định kỳ cần quy trình riêng.');if(!['income','expense'].includes(before.record.kind)||before.postings.length!==1)fail(422,'Chỉ phân bổ thu hoặc chi một tài khoản.');try{assertAllocationTotal(rows,before.record,before.postings);}catch{fail(422,'Tổng phân bổ phải khớp đúng số tiền giao dịch.');}
    const previous=allocationRows(tx.sql.all('SELECT category_id AS categoryId,CAST(amount_minor AS TEXT) AS amountMinor FROM wallet_allocations WHERE record_id=? ORDER BY category_id LIMIT 101',id)),retained=new Set(previous.map(row=>row.categoryId));for(const row of rows)checkWalletCatalog(reader,row.categoryId,[],retained.has(row.categoryId)?{record:{categoryId:row.categoryId},labelIds:[]}:undefined);
    if(JSON.stringify(previous)===JSON.stringify(rows))return {recordId:id,revision:before.record.revision,rows};
    tx.sql.run('DELETE FROM wallet_allocations WHERE record_id=?',id);for(const row of rows)tx.sql.run('INSERT INTO wallet_allocations VALUES(?,?,?)',id,row.categoryId,minorInteger(row.amountMinor));const at=new Date(now()).toISOString();tx.sql.run('UPDATE wallet_records SET revision=revision+1 WHERE id=?',id);tx.metadata.records.set({...before.metadata,updatedAt:at,updatedBy:ctx.actor.userId});const auditId=randomUUID();tx.audit.append({id:auditId,recordId:id,actorId:ctx.actor.userId,action:'wallet:record:allocations'});tx.metadata.audit.set({auditId,occurredAt:at,before:{recordId:id,revision:before.record.revision,rows:previous},after:{recordId:id,revision:before.record.revision+1,rows}});if(onChanged)tx.afterCommit(onChanged);return {recordId:id,revision:before.record.revision+1,rows};
   });
  },
  /** Draft-only clone: no IDs, source key, occurrence, audit, nonce or posting writes. */
  cloneRecordDraft(actor:Actor,id:string,instant:string):RecordDraft {
   const reader=ports.reader,guard=()=>{assertWalletActor(reader,actor);if(reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1'||!reader.get("SELECT name FROM sqlite_master WHERE name='wallet_record_fx' AND type='table'"))fail(409,'Wallet chưa sẵn sàng.');};guard();
   try{text(id,256);utcInstant(instant);}catch{fail(422,'Thời điểm clone không hợp lệ.');}
   if(reader.get('SELECT 1 AS linked FROM wallet_transfer_fees WHERE fee_record_id=?',id))fail(409,'Clone phí thông qua giao dịch chuyển khoản.');
   const source=result(reader,actor,id);
   if(source.feeRecordId&&result(reader,actor,source.feeRecordId).record.settlementStatus==='voided')fail(409,'Phí nguồn đã hủy; cần chọn phí mới rõ ràng.');
   const value=normalize({...asDraft(reader,actor,source),effectiveDate:effectiveDateAt(instant,source.record.timezone),occurredAt:instant,reviewedAt:null,settlementStatus:'uncleared'});
   checkTargets(reader,actor,value,{archive:true});checkWalletCatalog(reader,value.categoryId,value.labelIds);for(const row of value.allocations??[])checkWalletCatalog(reader,row.categoryId,[]);if(value.kind==='transfer'&&value.fee)checkWalletCatalog(reader,value.fee.categoryId??null,[]);guard();return value;
  },
  getActions(actor:Actor,id:string):WalletRecordActions {
   const reader=ports.reader,access=createWalletAccess(reader),guard=()=>{assertWalletActor(reader,actor);if(reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1')fail(409,'Wallet chưa sẵn sàng.');};guard();text(id,256);
   const visible=access.getRecord(actor,id);let allowed=false;
   try{authorize(reader,actor,id);allowed=true;}catch(error){if(!(error instanceof AppStoreError)||![403,404,409].includes(error.status))throw error;}
   const ordinary=allowed&&!visible.record.occurrenceId&&visible.record.kind!=='trade'&&visible.record.settlementStatus!=='voided';
   const result:WalletRecordActions={recordId:id,canEdit:ordinary,canVoid:ordinary},parent=reader.get('SELECT transfer_record_id AS id FROM wallet_transfer_fees WHERE fee_record_id=?',id);
   if(parent){try{access.getRecord(actor,parent.id);result.editViaTransferId=parent.id;}catch(error){if(!(error instanceof AppStoreError)||![403,404].includes(error.status))throw error;}}
   guard();access.getRecord(actor,id);return result;
  },
  createRecord(ctx:CommandContext,value:RecordDraft):WalletRecordResult {
   context(ctx,ports.reader);const draft=normalize(value);checkTargets(ports.reader,ctx.actor,draft);
   return run(ctx,'create',draft,tx=>{const reader=txReader(tx);context(ctx,reader);checkTargets(reader,ctx.actor,draft,{archive:true});const at=new Date(now()).toISOString(),parent=apply(tx,ctx.actor,draft,at),saved=setFee(tx,ctx.actor,parent,draft,at);audit(tx,ctx.actor,'create',at,null,saved);return saved;});
  },
  updateRecord(ctx:CommandContext,id:string,value:RecordPatch):WalletRecordResult {
   context(ctx,ports.reader,true);text(id,256);authorize(ports.reader,ctx.actor,id);const patch=payload(value,[...commonFields,...singleFields,...transferFields]);if(!Object.keys(patch).length)fail(400,'Thiếu thay đổi giao dịch.');
   return run(ctx,'update',{id,expectedRevision:ctx.expectedRevision,patch},tx=>{const reader=txReader(tx);context(ctx,reader,true);authorize(reader,ctx.actor,id);const before=result(reader,ctx.actor,id);if(before.record.revision!==ctx.expectedRevision)fail(409,'Giao dịch vừa được thay đổi.','edit-conflict');if(before.record.settlementStatus==='voided')fail(409,'Giao dịch đã hủy.');if(patch.kind!==undefined&&patch.kind!==before.record.kind&&(!['income','expense','adjustment'].includes(before.record.kind)||!['income','expense','adjustment'].includes(patch.kind as string)))fail(422,'Chuyển khoản và đầu tư cần quy trình chuyển loại riêng.');const base=asDraft(reader,ctx.actor,before),merged:Record<string,unknown>={...base,...patch};if(base.kind==='transfer'&&base.fee&&patch.fee&&typeof patch.fee==='object'&&!Array.isArray(patch.fee))merged.fee={...base.fee,...patch.fee};const draft=normalize(merged),previous=new Set(before.postings.map(p=>p.accountId)),previousFee=new Set<string>();if(before.feeRecordId)for(const p of result(reader,ctx.actor,before.feeRecordId).postings)previousFee.add(p.accountId);checkTargets(reader,ctx.actor,draft,{archive:true,previous,previousFee,otherCreator:before.record.creatorId!==ctx.actor.userId});const at=new Date(now()).toISOString(),parent=apply(tx,ctx.actor,draft,at,before),saved=setFee(tx,ctx.actor,parent,draft,at,before,Object.hasOwn(patch,'fee'));audit(tx,ctx.actor,'update',at,before,saved);return saved;});
  },
  voidRecord(ctx:CommandContext,id:string):WalletRecordResult {
   context(ctx,ports.reader,true);text(id,256);authorize(ports.reader,ctx.actor,id);
   return run(ctx,'void',{id,expectedRevision:ctx.expectedRevision},tx=>{const reader=txReader(tx);context(ctx,reader,true);authorize(reader,ctx.actor,id);const before=result(reader,ctx.actor,id);if(before.record.revision!==ctx.expectedRevision)fail(409,'Giao dịch vừa được thay đổi.','edit-conflict');if(before.record.settlementStatus==='voided')fail(409,'Giao dịch đã hủy.');if(before.record.kind==='trade')fail(409,'Cần quy trình hủy giao dịch đầu tư.');const at=new Date(now()).toISOString();if(before.feeRecordId)voidWithin(tx,ctx.actor,result(reader,ctx.actor,before.feeRecordId),at);return voidWithin(tx,ctx.actor,before,at);});
  },
 };
}
function plannedPostings(id:string,draft:Draft):WalletPosting[]{return draft.kind==='transfer'?[...(draft.fromAccountId===null?[]:[{recordId:id,accountId:draft.fromAccountId,deltaMinor:(-minorInteger(draft.debit.minor)).toString()}]),...(draft.toAccountId===null?[]:[{recordId:id,accountId:draft.toAccountId,deltaMinor:draft.credit.minor}])]:[{recordId:id,accountId:draft.accountId,deltaMinor:(draft.kind==='expense'?-minorInteger(draft.money.minor):minorInteger(draft.money.minor)).toString()}];}
