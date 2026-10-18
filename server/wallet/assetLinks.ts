import {createHash,randomUUID} from 'node:crypto';
import type {Actor,CommandContext} from '../../src/features/wallet/contracts.js';
import {object,keys,text} from '../../src/features/productivity/validation.js';
import {effectiveDateAt} from '../../src/features/wallet/dates.js';
import {createWalletAccess,assertWalletActor,type WalletReader} from './access.js';
import {assertWalletCommandContext} from './accounts.js';
import {createWalletInvestments} from './investments.js';
import {openWalletStore,type WalletTx} from './store.js';
import {walletStorageVersions} from './schemaRegistry.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {AppStoreError} from '../appErrors.js';
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'wallet-asset-link');};
const rowFor=(r:WalletReader,id:string)=>r.get('SELECT * FROM wallet_asset_links WHERE asset_id=?',id);
const available=(r:WalletReader)=>{const version=r.get("SELECT max(version)AS v FROM app_migrations WHERE namespace='wallet'")?.v;return version>=17&&walletStorageVersions.includes(version)&&!!r.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wallet_asset_links'");};
const readerFor=(tx:WalletTx):WalletReader=>({...tx.sql,get legacy(){return tx.legacy;}});
/** The shared legacy Asset becomes an intersection with the linked account.
 * Identity references are never copied into globally shared Asset JSON. */
export function canReadBoundAsset(reader:WalletReader,actor:Actor,id:string):boolean{
 if(!['admin','member'].includes(actor.role))return false;
 if(!reader.get("SELECT 1 FROM sqlite_master WHERE type='table'AND name='wallet_asset_links'"))return true;
 const row=rowFor(reader,id);if(!row||row.archived_at!==null)return true;
 if(!available(reader)||reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1')return false;
 try{createWalletAccess(reader).getAccount(actor,row.account_id);return true;}catch(error){if(error instanceof AppStoreError&&[403,404].includes(error.status))return false;throw error;}
}
export function createWalletAssetLinks(ports:{reader:WalletReader;write:typeof withAppWriteTransaction;now?:()=>number}){
 const store=openWalletStore({write:ports.write}),clock=ports.now??Date.now;
 const guard=(r:WalletReader,actor:Actor,active=true)=>{assertWalletActor(r,actor);if(!available(r)||active&&r.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1')fail(409,'Liên kết tài sản chưa được kích hoạt.');};
 const asset=(r:WalletReader,actor:Actor,id:string)=>{text(id,256);const source=r.get("SELECT json_extract(data,'$.createdById')AS creator,json_extract(data,'$.currency')AS currency,json_extract(data,'$.type')AS asset_type FROM assets WHERE id=?",id);if(!source)fail(404,'Không tìm thấy tài sản.');if(actor.role!=='admin'&&source.creator!==actor.userId)fail(403,'Không có quyền quản lý tài sản.');return source;};
 const target=(r:WalletReader,actor:Actor,input:{accountId:string;instrumentId:string},currency:string)=>{const account=createWalletAccess(r).getAccount(actor,input.accountId);if(account.permission!=='manage')fail(403,'Cần quyền quản lý tài khoản để liên kết vị thế.');if(account.type!=='investment'||account.archivedAt||account.currency!==currency)fail(422,'Tài sản và tài khoản đầu tư không khớp.');const instrument=r.get('SELECT currency,timezone,archived_at FROM wallet_instruments WHERE id=?',input.instrumentId);if(!instrument||instrument.archived_at||instrument.currency!==currency)fail(422,'Chứng khoán hoặc đơn vị tiền không khớp.');const date=effectiveDateAt(new Date(clock()).toISOString(),instrument.timezone),portfolio=createWalletInvestments({...ports,reader:r}).portfolio(actor,account.id,date),position=portfolio.positions.find(value=>value.instrument.id===input.instrumentId);if(!position||position.quantity==='0')fail(422,'Chưa có vị thế đang giữ để liên kết.');};
 const receipt=(row:any)=>({assetId:row.asset_id as string,accountId:row.account_id as string,instrumentId:row.instrument_id as string,revision:row.revision as number,archived:row.archived_at!==null});
 function save(tx:WalletTx,ctx:CommandContext,input:{assetId:string;accountId:string;instrumentId:string},archived:boolean){
  const r=readerFor(tx),before=rowFor(r,input.assetId),revision=(before?.revision??0)+1;if(before?.revision>=Number.MAX_SAFE_INTEGER-1)fail(409,'Liên kết đạt giới hạn phiên bản.');const at=new Date(Math.max(clock(),before?Date.parse(before.updated_at):0)).toISOString(),auditId=randomUUID(),after={asset_id:input.assetId,account_id:input.accountId,instrument_id:input.instrumentId,revision,archived_at:archived?at:null,created_by:before?.created_by??ctx.actor.userId,updated_by:ctx.actor.userId,created_at:before?.created_at??at,updated_at:at};
  if(before)tx.sql.run('UPDATE wallet_asset_links SET account_id=?,instrument_id=?,revision=?,archived_at=?,updated_by=?,updated_at=?WHERE asset_id=?',after.account_id,after.instrument_id,revision,after.archived_at,after.updated_by,at,input.assetId);else tx.sql.run('INSERT INTO wallet_asset_links VALUES(?,?,?,?,?,?,?,?,?)',input.assetId,input.accountId,input.instrumentId,revision,null,ctx.actor.userId,ctx.actor.userId,at,at);
  tx.audit.append({id:auditId,recordId:null,actorId:ctx.actor.userId,action:archived?'wallet:asset-link:archive':'wallet:asset-link:bind'});tx.metadata.audit.set({auditId,occurredAt:at,before:before?receipt(before):null,after:receipt(after)});
  tx.sql.run('INSERT INTO wallet_asset_link_revisions VALUES(?,?,?,?,?,?,?,?)',input.assetId,revision,input.accountId,input.instrumentId,Number(archived),ctx.actor.userId,at,auditId);return receipt(after);
 }
 return {
  canRead:(actor:Actor,id:string)=>canReadBoundAsset(ports.reader,actor,id),
  bind(rawContext:CommandContext,raw:unknown){const ctx=structuredClone(rawContext);let input:{assetId:string;accountId:string;instrumentId:string};try{const value=object(raw);keys(value,['assetId','accountId','instrumentId']);for(const key of['assetId','accountId','instrumentId'])text(value[key],256);input={assetId:value.assetId as string,accountId:value.accountId as string,instrumentId:value.instrumentId as string};}catch{return fail(400,'Tham chiếu tài sản không hợp lệ.');}
   guard(ports.reader,ctx.actor);assertWalletCommandContext(ctx,ports.reader);const source=asset(ports.reader,ctx.actor,input.assetId);if(source.asset_type!=='stock')fail(422,'Chỉ liên kết tài sản chứng khoán với vị thế.');target(ports.reader,ctx.actor,input,source.currency);
   const result=store.transaction({actorId:ctx.actor.userId,command:'wallet:asset-link:bind',requestId:ctx.idempotencyKey,payloadHash:createHash('sha256').update(JSON.stringify({input,revision:ctx.expectedRevision})).digest('hex')},tx=>{const r=readerFor(tx);guard(r,ctx.actor);assertWalletCommandContext(ctx,r);const source=asset(r,ctx.actor,input.assetId);if(source.asset_type!=='stock')fail(422,'Chỉ liên kết tài sản chứng khoán với vị thế.');target(r,ctx.actor,input,source.currency);const before=rowFor(r,input.assetId);if((before?.revision??0)!==ctx.expectedRevision)fail(409,'Liên kết tài sản đã thay đổi.');const duplicate=r.get('SELECT asset_id FROM wallet_asset_links WHERE account_id=?AND instrument_id=?AND archived_at IS NULL AND asset_id<>?',input.accountId,input.instrumentId,input.assetId);if(duplicate)fail(409,'Vị thế này đã được đại diện bởi tài sản khác.');return save(tx,ctx,input,false);});
   const current=rowFor(ports.reader,input.assetId);if(!current||current.revision!==result.revision||current.archived_at!==null||current.account_id!==input.accountId||current.instrument_id!==input.instrumentId)fail(409,'Tham chiếu đã được thay đổi sau lệnh này.');return result;
  },
  archive(rawContext:CommandContext,id:string){const ctx=structuredClone(rawContext);guard(ports.reader,ctx.actor,false);assertWalletCommandContext(ctx,ports.reader,true);asset(ports.reader,ctx.actor,id);const result=store.transaction({actorId:ctx.actor.userId,command:'wallet:asset-link:archive',requestId:ctx.idempotencyKey,payloadHash:createHash('sha256').update(JSON.stringify({id,revision:ctx.expectedRevision})).digest('hex')},tx=>{const r=readerFor(tx);guard(r,ctx.actor,false);assertWalletCommandContext(ctx,r,true);asset(r,ctx.actor,id);const before=rowFor(r,id);if(!before)fail(404,'Không tìm thấy tham chiếu.');if(before.revision!==ctx.expectedRevision)fail(409,'Tham chiếu vừa thay đổi.');if(before.archived_at!==null)return receipt(before);return save(tx,ctx,{assetId:id,accountId:before.account_id,instrumentId:before.instrument_id},true);});return {assetId:result.assetId,revision:result.revision,archived:true as const};},
 };
}
