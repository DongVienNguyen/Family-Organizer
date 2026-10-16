import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import type {registerDomainMigration} from '../appMigrations.js';
import type {AppSnapshot} from '../snapshotValidation.js';
import type {AppActor,ViewConfig} from '../../src/features/productivity/contracts.js';
import {object,text,choice} from '../../src/features/productivity/validation.js';
import {UserRole} from '../../src/types.js';
import {AppStoreError} from '../appErrors.js';
import {listPermission,type TaskReader} from './access.js';
import {assertContext} from './tasks.js';
export const productivityBoardViewChecksum=createHash('sha256').update('kanban-saved-view-canonical-board-reference-v8').digest('hex');
/** Semantic JSON format boundary; no table DDL or automatic rewrites. */
export function migrateBoardViewReferences(tx:AppWriteTx):void {validateBoardViewStorage(tx,7);}
export function registerBoardViewMigration(register:typeof registerDomainMigration):void {register('productivity',8,migrateBoardViewReferences,productivityBoardViewChecksum);}
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'board-reference');};
/** Fresh object authorization, including before an idempotent save cache hit. */
export function assertBoardViewReference(reader:TaskReader,actor:AppActor,config:ViewConfig):void {
 if(config.kind!=='kanban'||config.boardId===undefined)return;
 resolveBoardReference(reader,actor,config.boardId,config.mode);
}
export function resolveBoardReference(reader:TaskReader,actor:AppActor,boardId:string,mode:'sections'|'workflow'):{id:string;list_id:string;mode:'sections'|'workflow'} {
 assertContext({actor,expectedRevision:0,requestId:'board:reference'},reader);
 if(![8,9,10,11,12,13].includes(reader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version))fail(409,'Cần migration tham chiếu bảng trước khi dùng.');
 text(boardId,256);
 const board=reader.get("SELECT b.id,b.list_id,b.mode,l.is_shared FROM productivity_boards b JOIN productivity_lists l ON l.id=b.list_id LEFT JOIN productivity_catalog_revisions m ON m.entity_kind='list' AND m.entity_id=l.id WHERE b.id=? AND m.archived_at IS NULL",boardId);
 if(!board||!(actor.role===UserRole.ADMIN||board.is_shared||actor.role===UserRole.MEMBER&&listPermission(reader,actor,board.list_id)!==undefined))fail(404,'Không tìm thấy bảng.');
 if(board.mode!==mode)fail(422,'Chế độ góc nhìn không khớp bảng.');
 return {id:board.id,list_id:board.list_id,mode:board.mode};
}
function inspectReference(config:unknown,version:number,board:(id:string)=>any):void {
 const c=object(config);if(c.group==='tag'&&version<9)throw Error('Unsupported saved tag group version');if(c.kind!=='kanban'||c.boardId===undefined)return;
 if(version<8)throw Error('Unsupported saved board reference version');
 text(c.boardId,256);choice(c.mode,['sections','workflow']);const b=board(c.boardId);
 if(!b||b.mode!==c.mode)throw Error('Invalid saved board reference');
}
/** System-level reference integrity; stale grants/archival remain readable only
 * as owned configuration. Every live board resolve performs fresh object ACL. */
export function validateBoardViewStorage(reader:TaskReader,version:number):void {
 if(version<5)return;
 for(const row of reader.all("SELECT config_json FROM productivity_views"))inspectReference(JSON.parse(row.config_json),version,id=>reader.get('SELECT mode FROM productivity_boards WHERE id=?',id));
}
export function validateBoardViewSnapshot(snapshot:AppSnapshot):void {
 const version=snapshot.manifest.domains.productivity;if(version<5)return;
 const boards=new Map((snapshot.tables.productivity_boards??[]).map(b=>[b.id,b]));
 for(const row of snapshot.tables.productivity_views)inspectReference(JSON.parse(row.config_json),version,id=>boards.get(id));
}
