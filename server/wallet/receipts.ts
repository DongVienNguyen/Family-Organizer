import {createHash,randomUUID} from 'node:crypto';
import type {Actor,CommandContext} from '../../src/features/wallet/contracts.js';
import {text} from '../../src/features/productivity/validation.js';
import {AppStoreError} from '../appErrors.js';
import type {AppWriteTx,withAppWriteTransaction} from '../appStore.js';
import {assertWalletCommandContext} from './accounts.js';
import {assertWalletActor,createWalletAccess,type WalletReader} from './access.js';
import {parseReceiptUpload,type WalletReceiptMetadata} from './receiptContract.js';
import {receiptFromRow} from './receiptSchema.js';
import type {ReceiptFiles,StagedReceiptFile} from './receiptFiles.js';
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status);};
export interface ReceiptMutation {recordId:string;revision:number;receipt:WalletReceiptMetadata}
/** Synchronous file preparation precedes the short I01 claim transaction. No
 * external IO, second writer, public URL, activation or startup migration. */
export function createWalletReceipts(ports:{reader:WalletReader;write:typeof withAppWriteTransaction;files:ReceiptFiles;now?:()=>number}){
 const now=ports.now??Date.now;
 const guard=(reader:WalletReader,actor:Actor)=>{assertWalletActor(reader,actor);if(reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1'||!reader.get("SELECT name FROM sqlite_master WHERE type='table' AND name='wallet_receipts'"))fail(409,'Kho hóa đơn Wallet chưa sẵn sàng.');};
 const visible=(reader:WalletReader,actor:Actor,id:string)=>{guard(reader,actor);text(id,256);const value=createWalletAccess(reader).getRecord(actor,id);if(value.partial)fail(404,'Không tìm thấy giao dịch.');return value;};
 const writable=(reader:WalletReader,ctx:CommandContext,id:string)=>{assertWalletCommandContext(ctx,reader,true);const value=visible(reader,ctx.actor,id);createWalletAccess(reader).authorizeRecord(ctx.actor,id,'write');if(value.record.settlementStatus==='voided')fail(409,'Giao dịch đã hủy.');return value;};
 const txReader=(tx:AppWriteTx):WalletReader=>({get:tx.get,all:tx.all,get legacy(){return tx.legacy;}});
 const command=<T>(ctx:CommandContext,name:string,payload:unknown,fn:(tx:AppWriteTx)=>T)=>ports.write({actorId:ctx.actor.userId,command:'wallet:receipt:'+name,requestId:ctx.idempotencyKey,payloadHash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')},fn);
 const bump=(tx:AppWriteTx,ctx:CommandContext,id:string,at:string)=>{
  const row=tx.get('SELECT revision FROM wallet_records WHERE id=?',id);if(row.revision!==ctx.expectedRevision)fail(409,'Giao dịch vừa được thay đổi.');
  tx.run('UPDATE wallet_records SET revision=revision+1 WHERE id=?',id);tx.run('UPDATE wallet_record_metadata SET updated_at=?,updated_by=? WHERE record_id=?',at,ctx.actor.userId,id);return row.revision+1;
 };
 const audit=(tx:AppWriteTx,ctx:CommandContext,recordId:string,name:string,at:string,metadata:WalletReceiptMetadata,revision:number)=>{
  const id=randomUUID(),state={recordId,revision,receipt:{id:metadata.id,mime:metadata.mime,size:metadata.size,sha256:metadata.sha256,fileNameSha256:createHash('sha256').update(metadata.fileName).digest('hex')}};
  tx.run('INSERT INTO wallet_audit VALUES(?,?,?,?)',id,recordId,ctx.actor.userId,'wallet:receipt:'+name);
  tx.run('INSERT INTO wallet_audit_metadata VALUES(?,?,?,?)',id,at,name==='detach'?JSON.stringify(state):null,name==='attach'?JSON.stringify(state):null);
 };
 const cleanupUnclaimed=(stage:StagedReceiptFile)=>{
  try{if(ports.reader.get('SELECT 1 AS claimed FROM wallet_receipts WHERE file_key=?',stage.fileKey))return;}catch{return;}
  // Never remove committed bytes when a response/acknowledgement is lost.
  ports.files.rollback(stage);
 };
 const receiptIdentity=(value:unknown)=>{try{text(value,36);}catch{fail(400,'Mã hóa đơn không hợp lệ.');}};
 const get=(reader:WalletReader,recordId:string,receiptId:string)=>{receiptIdentity(receiptId);const row=reader.get('SELECT * FROM wallet_receipts WHERE record_id=? AND id=?',recordId,receiptId);if(!row)fail(404,'Không tìm thấy hóa đơn.');return receiptFromRow(row);};
 return {
  list(actor:Actor,recordId:string){const value=visible(ports.reader,actor,recordId),rows=ports.reader.all('SELECT * FROM wallet_receipts WHERE record_id=? ORDER BY id LIMIT 21',recordId);if(rows.length>20)fail(409,'Số hóa đơn vượt giới hạn hiện tại.');const receipts=rows.map(receiptFromRow);visible(ports.reader,actor,recordId);return {recordId,revision:value.record.revision,receipts};},
  read(actor:Actor,recordId:string,receiptId:string){visible(ports.reader,actor,recordId);const metadata=get(ports.reader,recordId,receiptId),result=ports.files.read(metadata);visible(ports.reader,actor,recordId);return {...result,fileName:metadata.fileName};},
  attach(ctx:CommandContext,recordId:string,input:unknown):ReceiptMutation {
   writable(ports.reader,ctx,recordId);const upload=parseReceiptUpload(input),payload={recordId,expectedRevision:ctx.expectedRevision,fileName:upload.fileName,mime:upload.mime,size:upload.size,sha256:upload.sha256};
   if(ports.reader.get("SELECT 1 AS present FROM app_commands WHERE command='wallet:receipt:attach' AND request_id=?",ctx.idempotencyKey))return command(ctx,'attach',payload,()=>{throw new AppStoreError('Biên nhận retry vừa thay đổi.',409);}) as ReceiptMutation;
   const stage=ports.files.stage(upload);
   let committed=false;
   try{
    const result=command(ctx,'attach',payload,tx=>{
     writable(txReader(tx),ctx,recordId);if(tx.get('SELECT count(*) AS n FROM wallet_receipts WHERE record_id=?',recordId).n>=20)fail(413,'Mỗi giao dịch tối đa 20 hóa đơn.');
     const at=new Date(now()).toISOString(),revision=bump(tx,ctx,recordId,at),receipt={...stage,recordId,createdAt:at,createdBy:ctx.actor.userId};
     tx.run('INSERT INTO wallet_receipts VALUES(?,?,?,?,?,?,?,?,?)',receipt.id,receipt.recordId,receipt.fileKey,receipt.fileName,receipt.mime,receipt.size,receipt.sha256,receipt.createdAt,receipt.createdBy);
     audit(tx,ctx,recordId,'attach',at,receipt,revision);return {recordId,revision,receipt};
    });
    if(result.receipt.id===stage.id){committed=true;ports.files.commit(stage);}else cleanupUnclaimed(stage);
    return result;
   }catch(error){if(!committed)cleanupUnclaimed(stage);throw error;}
  },
  detach(ctx:CommandContext,recordId:string,receiptId:string){
   writable(ports.reader,ctx,recordId);receiptIdentity(receiptId);
   return command(ctx,'detach',{recordId,receiptId,expectedRevision:ctx.expectedRevision},tx=>{
    writable(txReader(tx),ctx,recordId);const metadata=get(txReader(tx),recordId,receiptId),at=new Date(now()).toISOString(),revision=bump(tx,ctx,recordId,at);
    tx.run('DELETE FROM wallet_receipts WHERE id=? AND record_id=?',receiptId,recordId);audit(tx,ctx,recordId,'detach',at,metadata,revision);
    // Retained opaque bytes remain inaccessible and available to backups. A
    // separate ownership-aware retention job can collect unclaimed files later.
    return {recordId,revision,receiptId};
   });
  },
 };
}
