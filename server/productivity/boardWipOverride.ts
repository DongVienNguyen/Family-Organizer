import type {AppActor} from '../../src/features/productivity/contracts.js';
import type {AppWriteTx} from '../appStore.js';
import {text} from '../../src/features/productivity/validation.js';
import {AppStoreError} from '../appErrors.js';
interface Scope {taskId:string;boardId:string;columnId:string;reason:string}
interface Permit extends Scope {used:boolean}
const permits=new WeakMap<AppWriteTx,Permit>();
const fail=(status:number,message:string):never=>{throw new AppStoreError(message,status,'board-wip-override');};
/** Trusted synchronous command composition only, never caller-provided capability.
 * The command must persist its reason in Task history and the I01 result/audit. */
export function withBoardWipOverride<T>(tx:AppWriteTx,actor:AppActor,scope:Scope,work:()=>T):T {
 if(work.constructor.name==='AsyncFunction')fail(400,'Vượt WIP phải chạy đồng bộ.');
 if(tx.get("SELECT value FROM app_meta WHERE key='productivity_active'")?.value!=='1')fail(409,'Kho công việc chưa được kích hoạt.');
 const raw=tx.get('SELECT data FROM users WHERE id=?',actor.userId),user=raw?JSON.parse(raw.data):null;
 if(actor.role!=='admin'||user?.role!=='admin'||user.isDeleted)fail(403,'Chỉ quản trị viên được vượt WIP có lý do.');
 try{for(const value of [scope.taskId,scope.boardId,scope.columnId])text(value,256);text(scope.reason,500);}catch{fail(400,'Lý do hoặc phạm vi vượt WIP không hợp lệ.');}
 if(permits.has(tx))fail(409,'Phạm vi vượt WIP đang được sử dụng.');
 const permit={...scope,used:false};permits.set(tx,permit);
 try{const value=work();if(value&&typeof(value as any).then==='function'){Promise.resolve(value).catch(()=>{});fail(400,'Vượt WIP phải chạy đồng bộ.');}if(!permit.used)fail(422,'Thao tác không cần vượt giới hạn WIP.');return value;}finally{permits.delete(tx);}
}
/** The central store calls this only after detecting an actual new hard-limit
 * entrant. It grants exactly one matching admission inside the owning transaction. */
export function consumeBoardWipOverride(tx:AppWriteTx,scope:Omit<Scope,'reason'>):boolean {
 const permit=permits.get(tx);if(!permit||permit.used||permit.taskId!==scope.taskId||permit.boardId!==scope.boardId||permit.columnId!==scope.columnId)return false;
 permit.used=true;return true;
}
