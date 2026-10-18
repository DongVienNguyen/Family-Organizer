import {productivityVersionsFrom} from './knownVersions.js';
import type {AppWriteTx} from '../appStore.js';
import type {Notification,User} from '../../src/types.js';
import {UserRole} from '../../src/types.js';
import {createTaskAccess,type TaskReader} from './access.js';
import {defaultTaskNotificationPreferences,normalizeTaskNotificationPreferences,nextTaskDelivery} from '../../src/features/productivity/notificationPolicy.js';
/** Reference-only delivery metadata joins the existing inbox command. There is
 * still one legacy push effect queue and one shared AppJobs owner. Broadcast
 * inbox rows fan out to live/current Task readers, each with their own policy. */
export function stageTaskNotice(tx:AppWriteTx,notice:Notification,excludeUserId?:string):boolean {
 if(notice.sourceRef?.domain!=='task'||tx.get("SELECT value FROM app_meta WHERE key='productivity_active'")?.value!=='1')return false;
 if(!productivityVersionsFrom(14).includes(tx.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version))return false;
 const source=notice.sourceRef,access=createTaskAccess(tx);
 for(const user of tx.legacy.users){if(user.isDeleted||!Object.values(UserRole).includes(user.role)||user.id===excludeUserId||notice.userId!=='all'&&user.id!==notice.userId||!access.getTask({userId:user.id,role:user.role},source.id))continue;const raw=tx.get('SELECT settings_json FROM productivity_task_notification_preferences WHERE user_id=?',user.id),prefs=raw?normalizeTaskNotificationPreferences(JSON.parse(raw.settings_json)):defaultTaskNotificationPreferences,available=nextTaskDelivery(notice.createdAt,prefs);tx.run('INSERT OR IGNORE INTO productivity_task_notice_deliveries VALUES(?,?,?,?,?,?,?,?,?)',notice.id,source.id,user.id,notice.createdAt,available,available===null?'suppressed':'pending',null,notice.createdAt,notice.createdAt);}
 return true;
}
let digestReader:TaskReader|undefined;
export function installTaskDigestVisibility(reader:TaskReader):void {if(digestReader&&digestReader!==reader)throw Error('Task digest reader already installed');digestReader=reader;}
/** Digest content is generic; visibility still requires at least one live source
 * accessible to this recipient immediately before inbox read/external delivery. */
export function canViewTaskDigest(actor:{userId:string;role:User['role']},id:string):boolean {
 if(!digestReader||!productivityVersionsFrom(14).includes(digestReader.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version))return false;
 const access=createTaskAccess(digestReader);return digestReader.all("SELECT task_id FROM productivity_task_notice_deliveries WHERE recipient_id=? AND digest_key=? AND state='queued'",actor.userId,id).some(row=>access.getTask(actor,row.task_id)!==null);
}
