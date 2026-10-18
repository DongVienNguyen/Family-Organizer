import {createHash,randomUUID} from 'node:crypto';
import type {CommandContext} from '../../src/features/wallet/contracts.js';
import {minorInteger,currencyExponent} from '../../src/features/wallet/money.js';
import {parseEffectiveDate} from '../../src/features/wallet/dates.js';
import {object,keys} from '../../src/features/productivity/validation.js';
import {assertWalletActor,type WalletReader} from './access.js';
import {assertWalletCommandContext} from './accounts.js';
import {openWalletStore} from './store.js';
import type {withAppWriteTransaction} from '../appStore.js';
import {validateWalletFxCache} from './fxSchema.js';
import {AppStoreError} from '../appErrors.js';
export interface FxRate {fromCurrency:string;toCurrency:string;asOf:string;numerator:string;denominator:string;source:string}
export interface RefreshResult {asOf:string;quoteAsOf:string;inserted:number}
const source='frankfurter-v2-blended',day=86400000;
const fail=(status:number,message:string,code='INVALID_INPUT'):never=>{throw new AppStoreError(message,status,code);};
const gcd=(a:bigint,b:bigint):bigint=>b===0n?a:gcd(b,a%b);
/** Parse the original numeric JSON token, never its rounded Number value. */
export function decimalRate(raw:string):{numerator:string;denominator:string} {
 if(typeof raw!=='string'||raw.length>80||!/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw))throw Error('Invalid FX decimal');const [mantissa,power='0']=raw.toLowerCase().split('e'),[whole,fraction='']=mantissa.split('.'),exponent=Number(power)-fraction.length;if(!Number.isInteger(exponent)||Math.abs(exponent)>18)throw Error('FX decimal exponent outside supported precision');let n=BigInt(whole+fraction),d=1n;if(n<=0n)throw Error('Positive FX required');if(exponent>=0)n*=10n**BigInt(exponent);else d=10n**BigInt(-exponent);const divisor=gcd(n,d);n/=divisor;d/=divisor;return {numerator:minorInteger(n.toString()).toString(),denominator:minorInteger(d.toString()).toString()};
}
/** Fixed public reference source, no credentials or caller-controlled host.
 * Explicit refresh only. Importing this factory performs no IO. */
export function createFrankfurterProvider(fetcher:typeof fetch=fetch){return async(asOf:string):Promise<FxRate>=>{
 parseEffectiveDate(asOf);const response=await fetcher('https://api.frankfurter.dev/v2/rate/USD/VND?date='+asOf,{method:'GET',headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(5000)});if(!response.ok||!response.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail(502,'Nguồn tỷ giá chưa sẵn sàng.');if(Number(response.headers.get('content-length')??0)>16384)fail(502,'Phản hồi tỷ giá quá lớn.');let raw='';if(!response.body)fail(502,'Nguồn tỷ giá không có dữ liệu.');const stream=response.body.getReader(),decoder=new TextDecoder();let size=0;try{while(true){const part=await stream.read();if(part.done)break;size+=part.value.byteLength;if(size>16384)fail(502,'Phản hồi tỷ giá quá lớn.');raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}finally{await stream.cancel();}
 try{let lexeme:string|undefined;const value=JSON.parse(raw,(key,value,context?:{source?:string})=>{if(key==='rate'){if(lexeme!==undefined||typeof value!=='number'||typeof context?.source!=='string')throw Error('Invalid FX token');lexeme=context.source;}return value;});const row=object(value);keys(row,['date','base','quote','rate']);if(Object.keys(row).length!==4||row.base!=='USD'||row.quote!=='VND'||lexeme===undefined)throw Error('Invalid FX identity');parseEffectiveDate(row.date as string);return {fromCurrency:'USD',toCurrency:'VND',asOf:row.date as string,...decimalRate(lexeme),source};}catch{fail(502,'Dữ liệu nguồn tỷ giá không hợp lệ.');}
};}
export function createWalletFx(ports:{reader:WalletReader;write:typeof withAppWriteTransaction;provider:(asOf:string)=>Promise<FxRate>;now?:()=>number}){
 const store=openWalletStore({write:ports.write}),now=()=>new Date((ports.now??Date.now)()).toISOString();
 const ready=(reader:WalletReader)=>{if(reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value!=='1'||!reader.get("SELECT name FROM sqlite_master WHERE type='table' AND name='wallet_fx_rates'"))fail(409,'Kho tỷ giá chưa sẵn sàng.');};
 const guard=(reader:WalletReader,ctx:CommandContext)=>{assertWalletActor(reader,ctx.actor);if(ctx.actor.role!=='admin')fail(403,'Chỉ quản trị viên được cập nhật tỷ giá.');ready(reader);assertWalletCommandContext(ctx,reader);};
 const getFxRate=(pair:{fromCurrency:string;toCurrency:string},date:string):FxRate|null=>{currencyExponent(pair.fromCurrency);currencyExponent(pair.toCurrency);parseEffectiveDate(date);if(pair.fromCurrency===pair.toCurrency)return {...pair,asOf:date,numerator:'1',denominator:'1',source:'identity'};if(!ports.reader.get("SELECT name FROM sqlite_master WHERE type='table' AND name='wallet_fx_rates'"))return null;const row=ports.reader.get("SELECT * FROM wallet_fx_rates WHERE from_currency='USD' AND to_currency='VND' AND as_of<=? ORDER BY as_of DESC LIMIT 1",date);if(!row||Date.parse(date)-Date.parse(row.as_of)>7*day)return null;validateWalletFxCache({wallet_fx_rates:[row]});return {...pair,asOf:row.as_of,numerator:pair.fromCurrency==='USD'?row.numerator:row.denominator,denominator:pair.fromCurrency==='USD'?row.denominator:row.numerator,source:row.source};};
 return {getFxRate,async refreshRates(rawContext:CommandContext,asOf:string):Promise<RefreshResult>{
  const ctx=structuredClone(rawContext);guard(ports.reader,ctx);try{parseEffectiveDate(asOf);if(asOf>now().slice(0,10))throw Error();}catch{fail(400,'Ngày cập nhật tỷ giá không hợp lệ.');}const payloadHash=createHash('sha256').update(JSON.stringify({asOf})).digest('hex'),meta={actorId:ctx.actor.userId,command:'wallet:fx:refresh',requestId:ctx.idempotencyKey,payloadHash};
  // Only I01 returns cached results; this probe avoids provider IO on a replay.
  if(ports.reader.get('SELECT request_id FROM app_commands WHERE command=? AND request_id=?',meta.command,meta.requestId))return store.transaction<RefreshResult>(meta,()=>fail(409,'Biên nhận vừa thay đổi; hãy thử lại cùng yêu cầu.','CONFLICT'));
  const rate=structuredClone(await ports.provider(asOf));guard(ports.reader,ctx);const stamp=now(),row={from_currency:rate.fromCurrency,to_currency:rate.toCurrency,as_of:rate.asOf,numerator:rate.numerator,denominator:rate.denominator,source:rate.source,fetched_at:stamp};try{validateWalletFxCache({wallet_fx_rates:[row]});if(rate.asOf>asOf||Date.parse(asOf)-Date.parse(rate.asOf)>7*day)throw Error();}catch{fail(502,'Tỷ giá không khớp ngày hoặc nguồn yêu cầu.');}
  return store.transaction(meta,tx=>{const reader:WalletReader={...tx.sql,get legacy(){return tx.legacy;}};guard(reader,ctx);const existing=tx.sql.get('SELECT * FROM wallet_fx_rates WHERE from_currency=? AND to_currency=? AND as_of=?',rate.fromCurrency,rate.toCurrency,rate.asOf);if(existing){if(existing.numerator!==rate.numerator||existing.denominator!==rate.denominator||existing.source!==rate.source)fail(409,'Tỷ giá ngày này đã được chốt; không ghi đè.','CONFLICT');return {asOf,quoteAsOf:rate.asOf,inserted:0};}if(tx.sql.get('SELECT count(*) AS n FROM wallet_fx_rates').n>=100000)fail(413,'Kho tỷ giá vượt giới hạn.','LIMIT_EXCEEDED');tx.sql.run('INSERT INTO wallet_fx_rates VALUES(?,?,?,?,?,?,?)',...Object.values(row));const id=randomUUID();tx.audit.append({id,recordId:null,actorId:ctx.actor.userId,action:'wallet:fx:refresh'});tx.metadata.audit.set({auditId:id,occurredAt:stamp,before:null,after:{asOf,quoteAsOf:rate.asOf,source:rate.source}});return {asOf,quoteAsOf:rate.asOf,inserted:1};});
 }};
}
