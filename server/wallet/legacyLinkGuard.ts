import type {AppWriteTx} from '../appStore.js';
import {AppStoreError} from '../appErrors.js';
/** Legacy routes cannot silently break a financial association. Keep their
 * original unlinked behavior; coupled operations remain owned by Wallet/I01. */
export function assertNoActiveFinancialHistory(reader:Pick<AppWriteTx,'get'>|undefined,kind:'debt'|'goal',parentId:string,entryId?:string){
 if(!reader)throw new AppStoreError('Financial history requires the shared writer.',500);
 if(!reader.get("SELECT 1 FROM sqlite_master WHERE name='wallet_financial_links' AND type='table'"))return;
 if(reader.get("SELECT 1 FROM wallet_financial_links WHERE kind=? AND parent_id=? AND state='active'"+(entryId===undefined?'':' AND entry_id=?'),kind,parentId,...(entryId===undefined?[]:[entryId])))throw new AppStoreError('Cần xử lý lịch sử đã liên kết bằng thao tác tài chính tương ứng.',409,'wallet-financial-link');
}
