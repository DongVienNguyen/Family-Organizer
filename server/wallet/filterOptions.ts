import {walletAccountReadScope,type WalletReader} from './access.js';
import type {Actor} from '../../src/features/wallet/contracts.js';
import {text} from '../../src/features/productivity/validation.js';
import {AppStoreError} from '../appErrors.js';
export interface WalletFilterOptions {creators:{id:string;name:string}[];paymentMethods:string[]}
/** Facet membership is financial information: query current readable records
 * first and omit free text from a partial transfer, just as the shared list does. */
export function readWalletFilterOptions(reader:WalletReader,actor:Actor):WalletFilterOptions {
 const authority=()=>{const scope=walletAccountReadScope(reader,actor);if(reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1')throw new AppStoreError('Wallet chưa sẵn sàng.',409);return scope;};
 const scoped=()=>{const scope=authority();return {sql:`WITH allowed AS MATERIALIZED(SELECT a.id,a.revision,(${scope.sql}) AS permission FROM wallet_accounts a),
 visible AS MATERIALIZED(SELECT id,revision,permission FROM allowed WHERE permission IN('read','contribute','manage')),
 readable AS MATERIALIZED(SELECT r.id,r.revision,r.creator_id,EXISTS(SELECT 1 FROM wallet_postings hidden WHERE hidden.record_id=r.id AND NOT EXISTS(SELECT 1 FROM visible a WHERE a.id=hidden.account_id)) AS partial FROM wallet_records r WHERE EXISTS(SELECT 1 FROM wallet_postings p JOIN visible a ON a.id=p.account_id WHERE p.record_id=r.id))`,args:scope.args};};
 const signature=()=>{const scope=scoped(),row=reader.get(scope.sql+` SELECT json_array((SELECT json_group_array(json_array(id,revision,permission)) FROM(SELECT * FROM visible ORDER BY id)),(SELECT json_group_array(json_array(id,revision,creator_id,partial)) FROM(SELECT * FROM readable ORDER BY id))) AS fingerprint`,...scope.args);if(typeof row?.fingerprint!=='string')throw Error('Missing Wallet filter scope');return row.fingerprint;};
 const before=signature(),creatorsScope=scoped(),creatorRows=reader.all(creatorsScope.sql+" SELECT r.creator_id AS id,json_extract(u.data,'$.fullName') AS name,max(m.record_id IS NULL) AS missingMetadata FROM readable r LEFT JOIN users u ON u.id=r.creator_id LEFT JOIN wallet_record_metadata m ON m.record_id=r.id GROUP BY r.creator_id,json_extract(u.data,'$.fullName') ORDER BY r.creator_id LIMIT 10001",...creatorsScope.args);
 const methodScope=scoped(),methodRows=reader.all(methodScope.sql+" SELECT DISTINCT m.payment_method AS value FROM readable r LEFT JOIN wallet_record_metadata m ON m.record_id=r.id WHERE r.partial=0 AND (m.record_id IS NULL OR m.payment_method!='') ORDER BY m.payment_method LIMIT 10001",...methodScope.args);
 if(creatorRows.length>10000||methodRows.length>10000)throw new AppStoreError('Bộ lọc vượt giới hạn lựa chọn.',422,'LIMIT_EXCEEDED');
 const creators=creatorRows.map(row=>{if(row.missingMetadata!==0)throw Error('Missing readable Wallet record metadata');text(row.id,256);text(row.name,500);return {id:row.id,name:row.name};}),paymentMethods=methodRows.map(row=>{text(row.value,256,false);return row.value as string;}).filter(value=>value.trim().length>0);
 if(signature()!==before)throw new AppStoreError('Quyền hoặc danh sách đã thay đổi.',409,'CONFLICT');
 return {creators,paymentMethods};
}
