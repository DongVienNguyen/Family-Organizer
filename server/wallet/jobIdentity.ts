import type {WalletReader} from './access.js';
export interface WalletJobEpoch {id:string;committedAt:string|null}
/** The shared restore marker fences old managed references. This read creates
 * no table and does not bootstrap storage during module import. */
export function walletJobEpoch(reader:WalletReader):WalletJobEpoch {
 if(!reader.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_restore_commits'"))return {id:'initial',committedAt:null};
 const row=reader.get('SELECT id,committed_at FROM app_restore_commits ORDER BY rowid DESC LIMIT 1');return row?{id:row.id,committedAt:row.committed_at}:{id:'initial',committedAt:null};
}
export type WalletScheduleWork={type:'schedule-scan';key:string;payload:{scheduleId:string;revision:number;epoch:string}}|{type:'occurrence-confirm';key:string;payload:{occurrenceId:string;revision:number;epoch:string}}|{type:'occurrence-reminder';key:string;payload:{occurrenceId:string;revision:number;recipientId:string;offsetDays:number;epoch:string}};
