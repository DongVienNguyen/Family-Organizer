import {catalogItemValue,catalogDeletionValue,catalogDeletedValue} from './catalogDto.js';
import {catalogReferencesValue} from './catalogReferences.js';
import type {CategoryDraft,LabelDraft,CatalogReferences} from '../../../server/wallet/catalog.js';
import {selectionValue,bulkResultValue,bulkPreviewValue} from './bulkDto.js';
import type {SelectionInput} from '../../../server/wallet/selections.js';
import type {BulkSelection,RecordMetadataPatch} from '../../../server/wallet/bulk.js';
import type {WalletFilterOptions} from '../../../server/wallet/filterOptions.js';
import type {WalletReceiptMetadata} from '../../../server/wallet/receiptContract.js';
import { object, keys, text, integer, choice, boolean } from '../productivity/validation.js';
import { timezoneFormatter } from '../productivity/dates.js';
import { parseEffectiveDate } from './dates.js';
import { assertMoney, minorInteger, currencyExponent, convertMoney } from './money.js';
import { normalizeFilter } from './filter.js';
import type { RecordFilter, Money, Page } from './contracts.js';
import type { AccessibleWalletAccount, WalletPermission, WalletAccountGrant } from '../../../server/wallet/access.js';
import type { AccountDraft, AccountPatch, WalletAccountResult, WalletGrantResult, WalletCreditPosition } from '../../../server/wallet/accounts.js';
import type { RecordDraft, RecordPatch, WalletRecordResult,WalletRecordActions } from '../../../server/wallet/records.js';
import type { WalletRecordView } from '../../../server/wallet/query.js';
import type { WalletRecordDetail } from '../../../server/wallet/read.js';
import type {WalletCatalog,WalletCatalogItem,WalletCategoryView} from '../../../server/wallet/catalogView.js';
export class WalletApiError extends Error {
    constructor(readonly status: number, message: string, readonly code: string, readonly requestId: string | undefined, readonly unknownOutcome = false,readonly references?:CatalogReferences) { super(message); this.name = 'WalletApiError'; }
}
export interface WalletTransportPorts {
    request: typeof fetch;
    authHeaders: () => HeadersInit;
    newRequestId?: () => string;
}
export interface WalletRequestOptions extends RequestInit {
    readOnly?: boolean;
    responseType?:'json'|'blob';
}
const identity = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
/** Existing auth callback is read afresh. No token store, automatic retries,
 * integration credential or offline financial write queue. */
export function createWalletRequest(ports: WalletTransportPorts) {
    return async function walletRequest<T = unknown>(path: string, options: WalletRequestOptions = {}): Promise<T> {
        const url = new URL(path, 'https://wallet.invalid');
        if (!path.startsWith('/api/wallet/') || url.origin !== 'https://wallet.invalid' || !url.pathname.startsWith('/api/wallet/') || url.hash || url.username || url.password)
            throw new WalletApiError(400, 'Đường dẫn Wallet không hợp lệ.', 'INVALID_INPUT', undefined);
        const method = (options.method ?? 'GET').toUpperCase(), write = !['GET', 'HEAD'].includes(method) && options.readOnly !== true, headers = new Headers(options.headers), auth = new Headers(ports.authHeaders()).get('Authorization');
        if (!auth)
            throw new WalletApiError(401, 'Cần đăng nhập.', 'UNAUTHENTICATED', undefined);
        headers.set('Authorization', auth);
        let requestId = headers.get('x-request-id') ?? undefined;
        if (write && !identity(requestId))
            throw new WalletApiError(400, 'Cần mã yêu cầu hợp lệ cho thao tác ghi.', 'INVALID_INPUT', undefined);
        if (!identity(requestId))
            requestId = (ports.newRequestId ?? (() => crypto.randomUUID()))();
        if (!identity(requestId))
            throw new WalletApiError(400, 'Mã yêu cầu không hợp lệ.', 'INVALID_INPUT', undefined);
        headers.set('x-request-id', requestId);
        const { readOnly: _readOnly, responseType: _responseType, ...init } = options;
        let response: Response;
        try {
            response = await ports.request(path, { ...init, method, headers, cache: 'no-store', redirect: 'error', credentials: 'same-origin' });
        }
        catch (error) {
            if (!write && (error as any)?.name === 'AbortError')
                throw error;
            throw new WalletApiError(0, 'Chưa xác nhận được phản hồi Wallet.', 'NETWORK_ERROR', requestId, write);
        }
        const current = () => new Headers(ports.authHeaders()).get('Authorization') === auth;
        if (!current()) {
            try {
                await response.body?.cancel();
            }
            catch { }
            throw new WalletApiError(401, 'Phiên đăng nhập đã thay đổi.', 'SESSION_CHANGED', requestId, write);
        }
        let value: unknown;
        try {
            value = response.ok&&options.responseType==='blob'?await response.blob():await response.json();
        }
        catch {
            throw new WalletApiError(response.status, 'Phản hồi Wallet không hợp lệ.', 'INVALID_RESPONSE', requestId, write);
        }
        if (!current())
            throw new WalletApiError(401, 'Phiên đăng nhập đã thay đổi.', 'SESSION_CHANGED', requestId, write);
        const data = value as any, trace = identity(data?.requestId) ? data.requestId : identity(response.headers.get('x-request-id')) ? response.headers.get('x-request-id')! : requestId;
        if (!response.ok) {
            const code = typeof data?.code === 'string' && /^[A-Z_]{1,64}$/.test(data.code) ? data.code : response.status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_INPUT', message = typeof data?.error === 'string' ? data.error.slice(0, 500) : 'Không xử lý được yêu cầu Wallet.';
            let references;try{if(data?.references!==undefined)references=catalogReferencesValue(data.references);}catch{}
            throw new WalletApiError(response.status, message, code, trace, write && response.status >= 500,references);
        }
        return value as T;
    };
}
const pick = (value: Record<string, unknown>, fields: readonly string[]) => Object.fromEntries(fields.filter(field => value[field] !== undefined).map(field => [field, value[field]]));
function timestamp(value: unknown) { if (value === null)
    return; text(value, 24); if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
    throw Error('Invalid time'); }
function optionalId(value: unknown) { if (value !== undefined)
    text(value, 256); }
function provenance(value: Record<string, unknown>) { for (const key of ['createdAt', 'updatedAt'])
    timestamp(value[key]); for (const key of ['createdBy', 'updatedBy'])
    if (value[key] !== null)
        text(value[key], 256); if (value.createdAt !== null && value.updatedAt !== null && String(value.updatedAt) < String(value.createdAt))
    throw Error('Invalid chronology'); }
function accountValue(value: unknown, id?: string): AccessibleWalletAccount { const v = object(value); for (const key of ['id', 'ownerUserId'])
    text(v[key], 256); text(v.name, 500); choice(v.type, ['cash', 'bank', 'savings', 'credit', 'e_wallet', 'investment', 'asset', 'liability']); currencyExponent(v.currency as string); minorInteger(v.openingMinor); text(v.openingDate, 10); parseEffectiveDate(v.openingDate); integer(v.revision, 1); choice(v.accessMode, ['shared', 'private']); choice(v.permission, ['read', 'contribute', 'manage']); timestamp(v.archivedAt); if (id !== undefined && v.id !== id)
    throw Error('Account identity'); return pick(v, ['id', 'name', 'type', 'currency', 'ownerUserId', 'accessMode', 'openingMinor', 'openingDate', 'revision', 'archivedAt', 'permission']) as unknown as AccessibleWalletAccount; }
function accountResult(value: unknown, id?: string): WalletAccountResult { const v = object(value), account = accountValue(v.account, id), m = object(v.metadata); if (m.accountId !== account.id)
    throw Error('Account metadata identity'); provenance(m); boolean(m.excludedFromStats); if (m.creditLimitMinor !== null && minorInteger(m.creditLimitMinor) < 0n)
    throw Error('Invalid credit limit'); if (m.dueDay !== null)
    integer(m.dueDay, 1, 31); choice(m.balanceDisplay, ['book', 'available', 'both']); return { account, metadata: pick(m, ['accountId', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'excludedFromStats', 'creditLimitMinor', 'dueDay', 'balanceDisplay']) as unknown as WalletAccountResult['metadata'] }; }
function fxValue(value: unknown): WalletRecordResult['fx'] { if (value === null)
    return null; const v = object(value); for (const key of ['recordId', 'source'])
    text(v[key], 256); for (const key of ['fromCurrency', 'toCurrency'])
    currencyExponent(v[key] as string); for (const key of ['debitMinor', 'creditMinor', 'numerator', 'denominator'])
    if (minorInteger(v[key]) <= 0n)
        throw Error('Invalid FX'); text(v.asOf, 10); parseEffectiveDate(v.asOf); if (v.fromCurrency === v.toCurrency || convertMoney({ minor: v.debitMinor as string, currency: v.fromCurrency as string }, v.toCurrency as string, { numerator: v.numerator as string, denominator: v.denominator as string }).minor !== v.creditMinor)
    throw Error('Invalid FX amounts'); return pick(v, ['recordId', 'fromCurrency', 'toCurrency', 'debitMinor', 'creditMinor', 'numerator', 'denominator', 'asOf', 'source']) as unknown as WalletRecordResult['fx']; }
function ids(value: unknown): string[] { if (!Array.isArray(value) || value.length > 100000)
    throw Error('Invalid ID list'); for (const id of value)
    text(id, 256); if (new Set(value).size !== value.length)
    throw Error('Duplicate IDs'); return [...value]; }
function recordValue(value: unknown, detail: boolean, expected?: string): WalletRecordResult | WalletRecordDetail {
    const v = object(value), r = object(v.record), m = object(v.metadata);
    for (const key of ['id', 'creatorId', 'timezone'])
        text(r[key], 256);
    if (expected !== undefined && r.id !== expected)
        throw Error('Record identity');
    choice(r.kind, ['income', 'expense', 'transfer', 'adjustment', 'trade']);
    choice(r.source, ['manual', 'import', 'schedule', 'legacy']);
    choice(r.settlementStatus, ['uncleared', 'cleared', 'reconciled', 'voided']);
    text(r.effectiveDate, 10);
    parseEffectiveDate(r.effectiveDate);
    timezoneFormatter(r.timezone as string);
    text(r.note, 100000, false);
    integer(r.revision, 1);
    for (const key of ['externalKey', 'categoryId', 'occurrenceId'])
        optionalId(r[key]);
    if (m.recordId !== r.id)
        throw Error('Record metadata identity');
    provenance(m);
    timestamp(m.occurredAt);
    timestamp(m.reviewedAt);
    text(m.payee, 500, false);
    text(m.paymentMethod, 256, false);
    if (!Array.isArray(v.postings) || v.postings.length > 100000)
        throw Error('Invalid postings');
    const seen = new Set<string>(), postings = v.postings.map(input => { const p = object(input); if (p.recordId !== r.id)
        throw Error('Posting identity'); text(p.accountId, 256); minorInteger(p.deltaMinor); if (seen.has(p.accountId))
        throw Error('Duplicate posting'); seen.add(p.accountId); if (detail) {
        assertMoney({ minor: p.deltaMinor, currency: p.currency });
        text(p.accountName, 500);
    } return pick(p, detail ? ['recordId', 'accountId', 'deltaMinor', 'currency', 'accountName'] : ['recordId', 'accountId', 'deltaMinor']); });
    const fx = fxValue(v.fx);
    if (fx && fx.recordId !== r.id)
        throw Error('FX identity');
    if (v.feeRecordId !== null)
        text(v.feeRecordId, 256);
    const result = { record: pick(r, ['id', 'kind', 'effectiveDate', 'timezone', 'source', 'externalKey', 'note', 'settlementStatus', 'creatorId', 'revision', 'categoryId', 'occurrenceId']), metadata: pick(m, ['recordId', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'occurredAt', 'payee', 'paymentMethod', 'reviewedAt']), postings, fx, feeRecordId: v.feeRecordId, labelIds: ids(v.labelIds) };
    if (!detail)
        return result as unknown as WalletRecordResult;
    boolean(v.partial);
    const matched = ids(v.matchedAccountIds);
    if (matched.some(id => !seen.has(id)))
        throw Error('Hidden matching leg');
    if (v.partial && (fx !== null || r.note !== '' || r.externalKey !== undefined || m.payee !== '' || m.paymentMethod !== '' || result.labelIds.length))
        throw Error('Unredacted partial transfer');
    return { ...result, partial: v.partial, matchedAccountIds: matched } as unknown as WalletRecordDetail;
}
function pageValue(value: unknown, limit: number): Page<WalletRecordView> { const v = object(value); integer(v.total); if (v.nextCursor !== null)
    text(v.nextCursor, 4096); if (!Array.isArray(v.items) || v.items.length > limit || v.items.length > v.total)
    throw Error('Invalid record page'); const items = v.items.map(row => { const { fx: _fx, feeRecordId: _fee, ...view } = recordValue({ ...object(row), fx: null, feeRecordId: null }, true) as WalletRecordDetail; return view; }); if (new Set(items.map(item => item.record.id)).size !== items.length)
    throw Error('Duplicate page record'); return { items, total: v.total, nextCursor: v.nextCursor as string | null }; }
function creditValue(value: unknown): WalletCreditPosition { const v = object(value); currencyExponent(v.currency as string); const book = minorInteger(v.bookMinor), debt = minorInteger(v.debtMinor), limit = v.creditLimitMinor === null ? null : minorInteger(v.creditLimitMinor); if (debt !== (book < 0n ? -book : 0n) || limit !== null && limit < 0n)
    throw Error('Invalid credit position'); if (limit === null) {
    if (v.availableMinor !== null || v.utilization !== null)
        throw Error('Unknown credit limit');
}
else {
    if (minorInteger(v.availableMinor) !== limit + book)
        throw Error('Invalid credit availability');
    if (limit === 0n) {
        if (v.utilization !== null)
            throw Error('Invalid utilization');
    }
    else {
        const ratio = object(v.utilization);
        if (minorInteger(ratio.numerator) !== debt || minorInteger(ratio.denominator) !== limit)
            throw Error('Invalid utilization');
    }
} return pick(v, ['currency', 'bookMinor', 'creditLimitMinor', 'debtMinor', 'availableMinor', 'utilization']) as unknown as WalletCreditPosition; }
function catalogValue(value:unknown):WalletCatalog {
 const raw=object(value);
 const items=(input:unknown,category:boolean)=>{
  if(!Array.isArray(input)||input.length>10000)throw Error('Invalid catalog size');
  const result=input.map(entry=>{const row=object(entry);text(row.id,256);text(row.name,500);text(row.icon,256,false);text(row.color,256,false);boolean(row.hidden);integer(row.revision,1);timestamp(row.archivedAt);
   const item={id:row.id,name:row.name,icon:row.icon,color:row.color,hidden:row.hidden,revision:row.revision,archivedAt:row.archivedAt} as WalletCatalogItem;
   if(!category)return item;
   if(row.parentId!==null)text(row.parentId,256);choice(row.nature,['must','need','want','unspecified']);return {...item,parentId:row.parentId,nature:row.nature} as WalletCategoryView;
  });
  if(new Set(result.map(item=>item.id)).size!==result.length)throw Error('Duplicate catalog ID');return result;
 };
 const categories=items(raw.categories,true) as WalletCategoryView[],labels=items(raw.labels,false),byId=new Map(categories.map(item=>[item.id,item])),done=new Set<string>();
 for(const category of categories){let id:string|null=category.id;const path=new Set<string>();while(id!==null&&!done.has(id)){if(path.has(id))throw Error('Catalog cycle');path.add(id);const node=byId.get(id);if(!node)throw Error('Missing catalog parent');id=node.parentId;}for(const id of path)done.add(id);}
 return {categories,labels};
}
const receiptMimes={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','application/pdf':'pdf'} as const;
function receiptValue(value:unknown,recordId:string):WalletReceiptMetadata {
    const v=object(value),fields=['id','recordId','fileKey','fileName','mime','size','sha256','createdAt','createdBy'];keys(v,fields);if(Object.keys(v).length!==fields.length||v.recordId!==recordId)throw Error('Receipt record identity');
    text(v.id,36);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.id))throw Error('Receipt identity');
    choice(v.mime,Object.keys(receiptMimes) as (keyof typeof receiptMimes)[]);if(v.fileKey!==v.id+'.'+receiptMimes[v.mime])throw Error('Receipt file identity');
    text(v.fileName,200);text(v.createdBy,256);text(v.createdAt,24);timestamp(v.createdAt);integer(v.size,1,(v.mime==='application/pdf'?10:4)*1024*1024);text(v.sha256,64);if(!/^[a-f0-9]{64}$/.test(v.sha256))throw Error('Receipt checksum');return {...v} as unknown as WalletReceiptMetadata;
}
/** DTO decoders are browser-only; server imports above are erased types. */
export function createWalletApi(ports: WalletTransportPorts) {
    const walletRequest = createWalletRequest(ports), path = (kind: 'accounts' | 'records'|'categories'|'labels', id: string) => { text(id, 256); return '/api/wallet/' + kind + '/' + encodeURIComponent(id); };
    const read = async <T>(uri: string, decoder: (v: unknown) => T, options: WalletRequestOptions = {}, nonce?: string): Promise<T> => { const value = await walletRequest(uri, options); try {
        return decoder(value);
    }
    catch {
        const write = !['GET', 'HEAD'].includes((options.method ?? 'GET').toUpperCase()) && options.readOnly !== true;
        throw new WalletApiError(200, 'Phản hồi Wallet không hợp lệ.', 'INVALID_RESPONSE', nonce, write);
    } };
    const command = async <T>(uri: string, method: string, payload: unknown, nonce: string, decoder: (v: unknown) => T): Promise<T> => { if (!identity(nonce))
        throw new WalletApiError(400, 'Cần mã yêu cầu hợp lệ cho thao tác ghi.', 'INVALID_INPUT', undefined); return read(uri, decoder, { method, headers: { 'Content-Type': 'application/json', 'x-request-id': nonce }, body: JSON.stringify(payload) }, nonce); };
    const grantValue = (value: unknown, accountId: string, userId: string): WalletGrantResult => { const v = object(value), g = object(v.grant); text(v.accountId, 256); integer(v.revision, 1); text(g.userId, 256); if (v.accountId !== accountId || g.userId !== userId)
        throw Error('Grant identity'); if (g.permission !== null)
        choice(g.permission, ['read', 'contribute', 'manage']); return { accountId: v.accountId, revision: v.revision, grant: { userId: g.userId, permission: g.permission as WalletPermission | null } }; };
    return { walletRequest,
        catalogCapabilities:()=>read('/api/wallet/catalog/capabilities',value=>{const v=object(value);keys(v,['canManage']);boolean(v.canManage);return {canManage:v.canManage};}),
        category:(id:string)=>read(path('categories',id),value=>catalogItemValue(value,'category',id)),
        label:(id:string)=>read(path('labels',id),value=>catalogItemValue(value,'label',id)),
        createCategory:(input:Omit<CategoryDraft,'id'>,nonce:string)=>command('/api/wallet/categories','POST',{expectedRevision:0,input},nonce,value=>catalogItemValue(value,'category',undefined,0)),
        updateCategory:(id:string,expectedRevision:number,patch:Omit<CategoryDraft,'id'>,nonce:string)=>command(path('categories',id),'PATCH',{expectedRevision,patch},nonce,value=>catalogItemValue(value,'category',id,expectedRevision)),
        createLabel:(input:Omit<LabelDraft,'id'>,nonce:string)=>command('/api/wallet/labels','POST',{expectedRevision:0,input},nonce,value=>catalogItemValue(value,'label',undefined,0)),
        updateLabel:(id:string,expectedRevision:number,patch:Omit<LabelDraft,'id'>,nonce:string)=>command(path('labels',id),'PATCH',{expectedRevision,patch},nonce,value=>catalogItemValue(value,'label',id,expectedRevision)),
        categoryDeletion:(id:string)=>read(path('categories',id)+'/deletion',value=>catalogDeletionValue(value,id)),
        labelDeletion:(id:string)=>read(path('labels',id)+'/deletion',value=>catalogDeletionValue(value,id)),
        deleteCategory:(id:string,expectedRevision:number,nonce:string)=>command(path('categories',id),'DELETE',{expectedRevision},nonce,value=>catalogDeletedValue(value,id,expectedRevision)),
        deleteLabel:(id:string,expectedRevision:number,nonce:string)=>command(path('labels',id),'DELETE',{expectedRevision},nonce,value=>catalogDeletedValue(value,id,expectedRevision)),
        createSelection:(input:SelectionInput,nonce:string)=>command('/api/wallet/record-selections','POST',{expectedRevision:0,input},nonce,selectionValue),
        selectionMembers:(id:string,requestedIds:string[],options:{signal?:AbortSignal}={})=>{const requested=ids(requestedIds);if(requested.length>100)throw Error('Membership page limit');return read('/api/wallet/record-selections/'+encodeURIComponent(id)+'/members',value=>{const v=object(value);keys(v,['ids']);const members=ids(v.ids);if(members.some(id=>!requested.includes(id)))throw Error('Unexpected snapshot member');return members;},{method:'POST',readOnly:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:requested}),signal:options.signal});},
        releaseSelection:(id:string,nonce:string)=>command('/api/wallet/record-selections/'+encodeURIComponent(id),'DELETE',{expectedRevision:0},nonce,value=>{const v=object(value);keys(v,['released']);if(v.released!==true)throw Error('Release acknowledgement');return {released:true as const};}),
        bulkPreview:(selection:BulkSelection,patch:RecordMetadataPatch,options:{signal?:AbortSignal}={})=>read('/api/wallet/records/bulk-preview',value=>bulkPreviewValue(value,selection),{method:'POST',readOnly:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({selection,patch}),signal:options.signal}),
        bulkMetadata:(selection:BulkSelection,expectedRevision:number,patch:RecordMetadataPatch,nonce:string)=>command('/api/wallet/records/bulk-metadata','POST',{expectedRevision,selection,patch},nonce,value=>bulkResultValue(value,selection)),
        receipts:(id:string)=>read(path('records',id)+'/receipts',value=>{const v=object(value);if(v.recordId!==id||!Array.isArray(v.receipts)||v.receipts.length>20)throw Error('Receipt list identity');integer(v.revision,1);const receipts=v.receipts.map(row=>receiptValue(row,id));if(new Set(receipts.map(row=>row.id)).size!==receipts.length)throw Error('Duplicate receipts');return {recordId:id,revision:v.revision,receipts};}),
        attachReceipt:(id:string,revision:number,input:{fileName:string;dataUrl:string},nonce:string)=>command(path('records',id)+'/receipts','POST',{expectedRevision:revision,input},nonce,value=>{const v=object(value);if(v.recordId!==id||v.revision!==revision+1)throw Error('Receipt acknowledgement');return {recordId:id,revision:v.revision,receipt:receiptValue(v.receipt,id)};}),
        detachReceipt:(id:string,revision:number,receiptId:string,nonce:string)=>command(path('records',id)+'/receipts/'+encodeURIComponent(receiptId),'DELETE',{expectedRevision:revision},nonce,value=>{const v=object(value);if(v.recordId!==id||v.receiptId!==receiptId||v.revision!==revision+1)throw Error('Receipt acknowledgement');return {recordId:id,revision:v.revision,receiptId};}),
        async receiptFile(id:string,metadata:WalletReceiptMetadata):Promise<Blob>{
            const expected=receiptValue(metadata,id),auth=new Headers(ports.authHeaders()).get('Authorization'),blob=await walletRequest<Blob>(path('records',id)+'/receipts/'+encodeURIComponent(expected.id),{responseType:'blob'});
            const invalid=()=>new WalletApiError(200,'Nội dung hóa đơn không hợp lệ.','INVALID_RESPONSE',undefined);
            if(!(blob instanceof Blob)||blob.size!==expected.size||blob.type!==expected.mime)throw invalid();
            const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
            if(new Headers(ports.authHeaders()).get('Authorization')!==auth)throw new WalletApiError(401,'Phiên đăng nhập đã thay đổi.','SESSION_CHANGED',undefined);
            if(digest!==expected.sha256)throw invalid();return blob;
        },
        filterOptions:()=>read('/api/wallet/record-filter-options',value=>{const v=object(value);if(!Array.isArray(v.creators)||!Array.isArray(v.paymentMethods)||v.creators.length>10000||v.paymentMethods.length>10000)throw Error('Invalid filter option list');const creators=v.creators.map(input=>{const row=object(input);text(row.id,256);text(row.name,500);return {id:row.id,name:row.name};}),paymentMethods=v.paymentMethods.map(input=>{text(input,256);return input;});if(new Set(creators.map(row=>row.id)).size!==creators.length||new Set(paymentMethods).size!==paymentMethods.length)throw Error('Duplicate filter options');return {creators,paymentMethods} as WalletFilterOptions;}),
        catalog:()=>read('/api/wallet/catalog',catalogValue),
        actions:(id:string)=>read(path('records',id)+'/actions',value=>{const v=object(value);if(v.recordId!==id)throw Error('Action record identity');boolean(v.canEdit);boolean(v.canVoid);const result:WalletRecordActions={recordId:id,canEdit:v.canEdit,canVoid:v.canVoid};if(v.editViaTransferId!==undefined){text(v.editViaTransferId,256);if(v.editViaTransferId===id)throw Error('Action parent identity');result.editViaTransferId=v.editViaTransferId;}return result;}),
        status: () => read('/api/wallet/status', value => { const v = object(value); boolean(v.active); integer(v.storageVersion); return { active: v.active, storageVersion: v.storageVersion }; }),
        accounts: () => read('/api/wallet/accounts', value => { const v = object(value); if (!Array.isArray(v.accounts))
            throw Error(); const accounts = v.accounts.map(row => accountValue(row)); if (new Set(accounts.map(a => a.id)).size !== accounts.length)
            throw Error(); return accounts; }),
        account: (id: string) => read(path('accounts', id), value => accountResult(value, id)),
        balance: (id: string, date: string) => { parseEffectiveDate(date); return read(path('accounts', id) + '/balance?date=' + encodeURIComponent(date), value => { const v = object(value); if (v.date !== date)
            throw Error(); assertMoney(v.book); assertMoney(v.cleared); if (v.book.currency !== v.cleared.currency)
            throw Error('Balance currency mismatch'); const credit = v.credit === undefined ? undefined : creditValue(v.credit); if (credit && (credit.currency !== v.book.currency || credit.bookMinor !== v.book.minor))
            throw Error('Credit identity'); return { date, book: v.book, cleared: v.cleared, ...(credit === undefined ? {} : { credit }) }; }); },
        createAccount: (input: AccountDraft, nonce: string) => command('/api/wallet/accounts', 'POST', { expectedRevision: 0, input }, nonce, value => accountResult(value)),
        updateAccount: (id: string, expectedRevision: number, patch: AccountPatch, nonce: string) => command(path('accounts', id), 'PATCH', { expectedRevision, patch }, nonce, value => accountResult(value, id)),
        archiveAccount: (id: string, expectedRevision: number, nonce: string) => command(path('accounts', id), 'DELETE', { expectedRevision }, nonce, value => accountResult(value, id)),
        grants: (id: string) => read(path('accounts', id) + '/grants', value => { const v = object(value); if (!Array.isArray(v.grants))
            throw Error(); const grants = v.grants.map(input => { const row = object(input); if (row.accountId !== id)
            throw Error('Grant account'); text(row.userId, 256); choice(row.permission, ['read', 'contribute', 'manage']); return { accountId: id, userId: row.userId, permission: row.permission }; }); if (new Set(grants.map(row => row.userId)).size !== grants.length)
            throw Error('Duplicate grant'); return grants as WalletAccountGrant[]; }),
        setGrant: (id: string, userId: string, expectedRevision: number, permission: WalletPermission, nonce: string) => command(path('accounts', id) + '/grants/' + encodeURIComponent(userId), 'PUT', { expectedRevision, permission }, nonce, value => grantValue(value, id, userId)),
        removeGrant: (id: string, userId: string, expectedRevision: number, nonce: string) => command(path('accounts', id) + '/grants/' + encodeURIComponent(userId), 'DELETE', { expectedRevision }, nonce, value => grantValue(value, id, userId)),
        query: (filter: RecordFilter, cursor: string | null = null, limit = 50, options: {
            signal?: AbortSignal;
        } = {}) => { integer(limit, 1, 100); const normalized = normalizeFilter(filter); return read('/api/wallet/records/query', value => pageValue(value, limit), { method: 'POST', readOnly: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: normalized, cursor, limit }), signal: options.signal }); },
        record: (id: string, options: {
            signal?: AbortSignal;
        } = {}) => read(path('records', id), value => recordValue(value, true, id) as WalletRecordDetail, { signal: options.signal }),
        createRecord: (input: RecordDraft, nonce: string) => command('/api/wallet/records', 'POST', { expectedRevision: 0, input }, nonce, value => recordValue(value, false) as WalletRecordResult),
        updateRecord: (id: string, expectedRevision: number, patch: RecordPatch, nonce: string) => command(path('records', id), 'PATCH', { expectedRevision, patch }, nonce, value => recordValue(value, false, id) as WalletRecordResult),
        voidRecord: (id: string, expectedRevision: number, nonce: string) => command(path('records', id), 'DELETE', { expectedRevision }, nonce, value => recordValue(value, false, id) as WalletRecordResult),
    };
}
export type WalletApi = ReturnType<typeof createWalletApi>;
