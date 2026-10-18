import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import type {registerDomainMigration} from '../appMigrations.js';
import type {registerSnapshotTable,registerSnapshotRestorePolicy} from '../appSnapshot.js';
export const trackingReminderTables={
 productivity_tracking_reminders:['id','owner_id','habit_id','countdown_id','enabled','minute_of_day','revision','review_required','created_at','updated_at'],
 productivity_tracking_deliveries:['id','reminder_id','owner_id','local_date','timezone','source_revision','rule_revision','eligible_at','available_at','state','notification_id','digest_id','created_at','updated_at'],
}as const;
export const trackingReminderSchemaSql=`
CREATE TABLE productivity_tracking_reminders(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),habit_id TEXT REFERENCES productivity_habits(id),countdown_id TEXT REFERENCES productivity_countdowns(id),
 enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),minute_of_day INTEGER NOT NULL CHECK(minute_of_day BETWEEN 0 AND 1439),revision INTEGER NOT NULL CHECK(revision>=1),review_required INTEGER NOT NULL CHECK(review_required IN(0,1)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 CHECK((habit_id IS NULL)!=(countdown_id IS NULL)),CHECK(review_required=0 OR enabled=0),UNIQUE(owner_id,habit_id),UNIQUE(owner_id,countdown_id)
);
CREATE INDEX productivity_tracking_reminders_scan ON productivity_tracking_reminders(enabled,id);
CREATE TABLE productivity_tracking_deliveries(
 id TEXT PRIMARY KEY,reminder_id TEXT NOT NULL REFERENCES productivity_tracking_reminders(id),owner_id TEXT NOT NULL REFERENCES users(id),local_date TEXT NOT NULL,timezone TEXT NOT NULL,
 source_revision INTEGER NOT NULL CHECK(source_revision>=1),rule_revision INTEGER NOT NULL CHECK(rule_revision>=1),eligible_at TEXT NOT NULL,available_at TEXT,state TEXT NOT NULL CHECK(state IN('pending','delivered','suppressed','consumed')),
 notification_id TEXT,digest_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(reminder_id,local_date)
);
CREATE INDEX productivity_tracking_deliveries_due ON productivity_tracking_deliveries(state,available_at,id);
`;
export const productivityTrackingReminderChecksum=createHash('sha256').update(trackingReminderSchemaSql+'\nprivate-owner-tracking-reminders-no-phantom-tasks-v21-pilot').digest('hex');
function restoreTrackingReminders(tx:AppWriteTx,now:number):void {const at=new Date(now).toISOString();if(tx.get('SELECT id FROM productivity_tracking_reminders WHERE revision>=? LIMIT 1',Number.MAX_SAFE_INTEGER-1))throw Error('Tracking reminder revision limit');tx.run("UPDATE productivity_tracking_reminders SET enabled=0,review_required=1,revision=revision+1,updated_at=CASE WHEN updated_at>? THEN updated_at ELSE ? END",at,at);tx.run("UPDATE productivity_tracking_deliveries SET state='consumed',available_at=NULL,updated_at=CASE WHEN updated_at>? THEN updated_at ELSE ? END WHERE state='pending'",at,at);}
export function registerTrackingReminderMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable;registerRestorePolicy?:typeof registerSnapshotRestorePolicy}):void {for(const [table,columns]of Object.entries(trackingReminderTables))ports.registerSnapshot('productivity',table,columns);ports.registerMigration('productivity',21,(tx:AppWriteTx)=>tx.exec(trackingReminderSchemaSql),productivityTrackingReminderChecksum);ports.registerRestorePolicy?.('productivity','tracking-reminders-review',21,restoreTrackingReminders);}
