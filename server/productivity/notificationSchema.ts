import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import type {registerDomainMigration} from '../appMigrations.js';
import type {registerSnapshotTable,registerSnapshotRestorePolicy} from '../appSnapshot.js';
export const taskNotificationTables={
 productivity_task_notification_preferences:['user_id','revision','settings_json','updated_at'],
 productivity_task_reminder_rules:['id','identity_key','task_id','recipient_id','kind','offset_minutes','absolute_at','enabled','revision','created_at','updated_at'],
 productivity_task_reminder_claims:['id','rule_id','task_id','occurrence_key','recipient_id','kind','fire_at','source_fingerprint','state','created_at','updated_at'],
 productivity_task_notice_deliveries:['notification_id','task_id','recipient_id','eligible_at','available_at','state','digest_key','created_at','updated_at'],
}as const;
export const taskNotificationSchemaSql=`
CREATE TABLE productivity_task_notification_preferences(
 user_id TEXT PRIMARY KEY REFERENCES users(id),revision INTEGER NOT NULL CHECK(revision>=1),
 settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),updated_at TEXT NOT NULL
);
CREATE TABLE productivity_task_reminder_rules(
 id TEXT PRIMARY KEY,identity_key TEXT NOT NULL UNIQUE,task_id TEXT NOT NULL REFERENCES productivity_tasks(id),
 recipient_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN('due','timebox','absolute')),
 offset_minutes INTEGER,absolute_at TEXT,enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),
 revision INTEGER NOT NULL CHECK(revision>=1),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 CHECK((kind='absolute' AND offset_minutes IS NULL AND absolute_at IS NOT NULL) OR(kind IN('due','timebox') AND offset_minutes IS NOT NULL AND offset_minutes>=0 AND offset_minutes<=525600 AND absolute_at IS NULL))
);
CREATE INDEX productivity_task_reminder_task ON productivity_task_reminder_rules(task_id,id);
CREATE TABLE productivity_task_reminder_claims(
 id TEXT PRIMARY KEY,rule_id TEXT NOT NULL REFERENCES productivity_task_reminder_rules(id),
 task_id TEXT NOT NULL REFERENCES productivity_tasks(id),occurrence_key TEXT NOT NULL,
 recipient_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN('due','timebox','absolute')),
 fire_at TEXT NOT NULL,source_fingerprint TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('pending','cancelled','suppressed','consumed','delivered')),
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(task_id,occurrence_key,recipient_id,kind,fire_at)
);
CREATE INDEX productivity_task_reminder_due ON productivity_task_reminder_claims(state,fire_at,id);
CREATE TABLE productivity_task_notice_deliveries(
 notification_id TEXT NOT NULL,task_id TEXT NOT NULL REFERENCES productivity_tasks(id),
 recipient_id TEXT NOT NULL REFERENCES users(id),eligible_at TEXT NOT NULL,available_at TEXT,
 state TEXT NOT NULL CHECK(state IN('pending','queued','suppressed','consumed')),digest_key TEXT,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(notification_id,recipient_id)
);
CREATE INDEX productivity_task_notice_due ON productivity_task_notice_deliveries(state,available_at,notification_id);
`;
export const productivityTaskNotificationChecksum=createHash('sha256').update(taskNotificationSchemaSql+'\ndurable-task-reminders-quiet-digest-v14-pilot').digest('hex');
/** Explicit pilot upgrade only. Registering persisted14 on restart never applies
 * this migration to an existing13 installation or raises Windows package caps. */
export function registerTaskNotificationMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable;registerRestorePolicy:typeof registerSnapshotRestorePolicy}):void {
 for(const [table,columns]of Object.entries(taskNotificationTables))ports.registerSnapshot('productivity',table,columns);
 ports.registerRestorePolicy('productivity','task-notifications',14,consumeTaskNotificationBacklog);
 ports.registerMigration('productivity',14,(tx:AppWriteTx)=>tx.exec(taskNotificationSchemaSql),productivityTaskNotificationChecksum);
}

function consumeTaskNotificationBacklog(tx:AppWriteTx,now:number):void {
 const at=new Date(now).toISOString();
 // Consume old outbound notice references regardless of the snapshot clock.
 // Keep historical inbox rows and re-authorize genuine future reminders later.
 tx.run("UPDATE productivity_task_notice_deliveries SET state='consumed',updated_at=CASE WHEN updated_at<? THEN ? ELSE updated_at END WHERE state='pending'",at,at);
 tx.run("UPDATE productivity_task_reminder_claims SET state='consumed',updated_at=CASE WHEN updated_at<? THEN ? ELSE updated_at END WHERE state='pending' AND fire_at<=?",at,at,at);
}
