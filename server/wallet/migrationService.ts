import type {FamilyOrganizerDB} from '../../src/types.js';
import {UserRole} from '../../src/types.js';
import type {Actor,CommandContext} from '../../src/features/wallet/contracts.js';
import {text,integer,choice} from '../../src/features/productivity/validation.js';
import {timezoneFormatter} from '../../src/features/productivity/dates.js';
import type {withAppWriteTransaction} from '../appStore.js';
import type {AppSnapshot,ValidatedAppSnapshot} from '../snapshotValidation.js';
import {AppStoreError} from '../appErrors.js';
import {assertWalletActor,type WalletReader} from './access.js';
import {openWalletStore} from './store.js';
import {migrateLegacyFinance,type LegacyFinanceSnapshot,type LegacyMigrationReceipt} from './migrate.js';
import {legacySourceChecksum} from './legacyMigrationData.js';
type LegacySource=Pick<FamilyOrganizerDB,'transactions'|'customCategories'|'hiddenBuiltinCategories'|'debts'|'savingsGoals'>;
export function legacyFinanceSource(legacy:LegacySource):LegacyFinanceSnapshot {return structuredClone({transactions:legacy.transactions,customCategories:legacy.customCategories,hiddenBuiltinCategories:legacy.hiddenBuiltinCategories,debts:legacy.debts,savingsGoals:legacy.savingsGoals});}
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'wallet-legacy-migration');};
const sourceChecksum=(source:LegacyFinanceSnapshot,timezone:string)=>legacySourceChecksum({version:2,timezone,source});
function admin(reader:WalletReader,actor:Actor){if(assertWalletActor(reader,actor).role!==UserRole.ADMIN)fail(403,'Chỉ quản trị viên được xem hoặc chạy di trú tài chính.');}
function inactive(reader:WalletReader,actor:Actor){admin(reader,actor);if(reader.get("SELECT value FROM app_meta WHERE key='wallet_active'")?.value==='1')fail(409,'Kho Wallet đang hoạt động.');if(reader.get("SELECT max(version) AS version FROM app_migrations WHERE namespace='wallet'")?.version!==4)fail(409,'Cần kho Wallet phiên bản 4 trước khi di trú.');}
export type LegacyMigrationResult=LegacyMigrationReceipt&{safetyBackup:{id:string;checksum:string}};
export interface MigrationLink {sourceKind:string;parentId:string;legacyId:string;targetId:string|null;state:string;reason:string|null;detail:Record<string,unknown>}
type State='mapped'|'quarantined'|'legacy_unlinked';
/** No storage owner, runtime job, route or activation. The backup port must persist
 * and read back its safety snapshot before resolving; the existing I01 validator
 * validates those read-back bytes. Files/network never run inside the SQL writer. */
export function createWalletLegacyMigration(ports:{reader:WalletReader;write:typeof withAppWriteTransaction;readSource:()=>LegacyFinanceSnapshot;backup:(actor:Actor)=>Promise<{id:string;snapshot:AppSnapshot}>;validateBackup:(value:unknown)=>ValidatedAppSnapshot;now?:()=>number}){
 const store=openWalletStore({write:ports.write});
 return {
  async migrate(context:CommandContext,options:{timezone:string}):Promise<LegacyMigrationResult>{
   // Clone the authority/request boundary before an asynchronous host callback.
   const ctx=structuredClone(context),timezone=options.timezone;inactive(ports.reader,ctx.actor);text(ctx.idempotencyKey,256);if(ctx.expectedRevision!==undefined&&ctx.expectedRevision!==0)fail(400,'Lệnh di trú không dùng phiên bản chỉnh sửa.');timezoneFormatter(timezone);
   const source=structuredClone(ports.readSource()),expected=sourceChecksum(source,timezone),backup=await ports.backup({...ctx.actor});
   // A demotion/deletion or concurrent legacy change can happen during backup.
   inactive(ports.reader,ctx.actor);if(sourceChecksum(ports.readSource(),timezone)!==expected)fail(409,'Nguồn thay đổi trong lúc backup; cần tạo backup mới.');text(backup.id,512);const saved=ports.validateBackup(backup.snapshot);
   if(saved.manifest.domains.wallet!==4||saved.tables.app_meta.some(row=>row.key==='wallet_active'&&row.value==='1')||sourceChecksum(legacyFinanceSource(saved.legacy),timezone)!==expected)fail(409,'Backup không khớp nguồn di trú hiện tại.');
   return store.transaction({actorId:ctx.actor.userId,command:'wallet:legacy:migrate',requestId:ctx.idempotencyKey,payloadHash:expected},tx=>{
    const reader={...tx.sql,get legacy(){return tx.legacy;}};inactive(reader,ctx.actor);if(sourceChecksum(legacyFinanceSource(tx.legacy),timezone)!==expected)fail(409,'Nguồn thay đổi trước khi lấy quyền ghi.');
    const receipt=migrateLegacyFinance(tx,source,{actor:ctx.actor,timezone,now:new Date((ports.now??Date.now)()).toISOString()});return {...receipt,safetyBackup:{id:backup.id,checksum:saved.manifest.checksum}};
   });
  },
  listLinks(actor:Actor,runId:string,options:{limit?:number;cursor?:string;state?:State}={}):{items:MigrationLink[];total:number;nextCursor:string|null}{
   admin(ports.reader,actor);text(runId,256);const limit=options.limit??50;integer(limit,1,100);if(options.state!==undefined)choice(options.state,['mapped','quarantined','legacy_unlinked']);const state=options.state??null;
   let after:string[]|null=null;if(options.cursor!==undefined){try{text(options.cursor,2048);const parsed=JSON.parse(Buffer.from(options.cursor,'base64url').toString('utf8'));if(!Array.isArray(parsed)||parsed.length!==5||parsed[0]!==runId||parsed[1]!==state)throw Error();for(const value of parsed.slice(2))text(value,256);after=parsed.slice(2);}catch{fail(400,'Con trỏ báo cáo di trú không hợp lệ.');}}
   if(!ports.reader.get('SELECT id FROM wallet_legacy_runs WHERE id=?',runId))fail(404,'Không tìm thấy lần di trú.');const where='run_id=?'+(state===null?'':' AND state=?'),params=state===null?[runId]:[runId,state];
   const total=ports.reader.get('SELECT count(*) AS n FROM wallet_legacy_links WHERE '+where,...params).n,rows=ports.reader.all('SELECT source_kind,parent_id,legacy_id,target_id,state,reason,detail_json FROM wallet_legacy_links WHERE '+where+(after?' AND (source_kind,parent_id,legacy_id)>(?,?,?)':'')+' ORDER BY source_kind,parent_id,legacy_id LIMIT ?',...params,...(after??[]),limit+1);
   const more=rows.length>limit,items:MigrationLink[]=rows.slice(0,limit).map(row=>({sourceKind:row.source_kind,parentId:row.parent_id,legacyId:row.legacy_id,targetId:row.target_id,state:row.state,reason:row.reason,detail:JSON.parse(row.detail_json)})),last=items.at(-1);
   return {items,total,nextCursor:more&&last?Buffer.from(JSON.stringify([runId,state,last.sourceKind,last.parentId,last.legacyId])).toString('base64url'):null};
  },
 };
}
