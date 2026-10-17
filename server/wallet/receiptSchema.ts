import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import {detectedMediaType} from '../mediaContent.js';
import {validateReceiptMetadata,receiptMediaPath,type WalletReceiptMetadata} from './receiptContract.js';
/** Additive metadata only. Bytes stay in DATA_DIR and travel in shared I01 media. */
export const walletReceiptSql=`
CREATE TABLE IF NOT EXISTS wallet_receipts(id TEXT PRIMARY KEY,record_id TEXT NOT NULL REFERENCES wallet_records(id),file_key TEXT NOT NULL UNIQUE,file_name TEXT NOT NULL,mime TEXT NOT NULL CHECK(mime IN('image/png','image/jpeg','image/webp','image/gif','application/pdf')),size INTEGER NOT NULL CHECK(typeof(size)='integer' AND size>0 AND size<=10485760),sha256 TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS wallet_receipt_record ON wallet_receipts(record_id,id);
`;
export const walletReceiptChecksum=createHash('sha256').update(walletReceiptSql+'\nwallet-private-receipt-manifest-v5').digest('hex');
export const walletReceiptColumns={wallet_receipts:['id','record_id','file_key','file_name','mime','size','sha256','created_at','created_by']} as const;
export function prepareWalletReceipts(tx:AppWriteTx):void {tx.exec(walletReceiptSql);}
export function receiptFromRow(row:Record<string,any>):WalletReceiptMetadata {
 const metadata={id:row.id,recordId:row.record_id,fileKey:row.file_key,fileName:row.file_name,mime:row.mime,size:row.size,sha256:row.sha256,createdAt:row.created_at,createdBy:row.created_by};
 validateReceiptMetadata(metadata);return metadata;
}
export function validateWalletReceiptTables(tables:Record<string,Record<string,any>[]>,userIds?:Set<string>):void {
 const recordIds=new Set(tables.wallet_records.map(row=>String(row.id))),keys=new Set<string>();
 for(const row of tables.wallet_receipts){const metadata=receiptFromRow(row);validateReceiptMetadata(metadata,recordIds,userIds);if(keys.has(metadata.fileKey))throw Error('Duplicate receipt file key');keys.add(metadata.fileKey);}
}
export function validateWalletReceiptMedia(tables:Record<string,Record<string,any>[]>,media:Record<string,string>):void {
 for(const row of tables.wallet_receipts){
  const metadata=receiptFromRow(row),encoded=media[receiptMediaPath(metadata.fileKey)];
  if(typeof encoded!=='string')throw Error('Missing private receipt bytes');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length!==metadata.size||bytes.toString('base64')!==encoded||createHash('sha256').update(bytes).digest('hex')!==metadata.sha256||detectedMediaType(bytes)!==metadata.mime)throw Error('Private receipt media integrity mismatch');
 }
}
