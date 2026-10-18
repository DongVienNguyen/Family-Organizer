import {createHash,randomUUID} from 'node:crypto';import type {AppWriteTx} from '../appStore.js';import type {registerDomainMigration} from '../appMigrations.js';import type {registerSnapshotTable,registerSnapshotRestorePolicy,SnapshotRestoreContext} from '../appSnapshot.js';
export const focusTables={
 productivity_focus_settings:['user_id','revision','focus_seconds','short_break_seconds','long_break_seconds','completed_pomos','notify_end','timezone','updated_at'],
 productivity_focus_sessions:['id','owner_id','source','mode','phase','target_type','task_id','habit_id','root_task_id','quadrant_at_start','status','revision','timer_generation','planned_seconds','active_milliseconds','run_started_at','deadline_at','started_at','ended_at','override_seconds','note','estimate_seconds','cycle_index','created_at','updated_at'],
 productivity_focus_segments:['id','session_id','started_at','ended_at','elapsed_milliseconds'],
 productivity_focus_audit:['id','session_id','actor_id','action','before_json','after_json','reason','created_at'],
 productivity_focus_notices:['session_id','owner_id','eligible_at','available_at','state','digest_id','notification_id','created_at','updated_at'],
}as const;
export const focusSchemaSql=`
CREATE TABLE productivity_focus_settings(
 user_id TEXT PRIMARY KEY REFERENCES users(id),revision INTEGER NOT NULL CHECK(revision>=1),focus_seconds INTEGER NOT NULL CHECK(focus_seconds BETWEEN 1 AND 86400),
 short_break_seconds INTEGER NOT NULL CHECK(short_break_seconds BETWEEN 1 AND 86400),long_break_seconds INTEGER NOT NULL CHECK(long_break_seconds BETWEEN 1 AND 86400),
 completed_pomos INTEGER NOT NULL CHECK(completed_pomos BETWEEN 0 AND 4),notify_end INTEGER NOT NULL CHECK(notify_end IN(0,1)),timezone TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE TABLE productivity_focus_sessions(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),source TEXT NOT NULL CHECK(source IN('timer','manual')),mode TEXT NOT NULL CHECK(mode IN('pomo','stopwatch')),
 phase TEXT NOT NULL CHECK(phase IN('focus','short_break','long_break')),target_type TEXT NOT NULL CHECK(target_type IN('task','habit','none')),
 task_id TEXT REFERENCES productivity_tasks(id),habit_id TEXT,root_task_id TEXT REFERENCES productivity_tasks(id),quadrant_at_start TEXT CHECK(quadrant_at_start IN('q1','q2','q3','q4')),
 status TEXT NOT NULL CHECK(status IN('running','paused','completed','cancelled')),revision INTEGER NOT NULL CHECK(revision>=1),timer_generation INTEGER NOT NULL CHECK(timer_generation>=0),
 planned_seconds INTEGER NOT NULL CHECK(planned_seconds BETWEEN 1 AND 86400),active_milliseconds INTEGER NOT NULL CHECK(active_milliseconds>=0 AND active_milliseconds<=planned_seconds*1000),
 run_started_at TEXT,deadline_at TEXT,started_at TEXT NOT NULL,ended_at TEXT,override_seconds INTEGER CHECK(override_seconds BETWEEN 0 AND 86400),note TEXT NOT NULL,
 estimate_seconds INTEGER CHECK(estimate_seconds BETWEEN 0 AND 86400),cycle_index INTEGER NOT NULL CHECK(cycle_index BETWEEN 0 AND 4),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 CHECK((target_type='task'AND task_id IS NOT NULL AND habit_id IS NULL AND root_task_id IS NOT NULL)OR(target_type='habit'AND task_id IS NULL AND habit_id IS NOT NULL AND root_task_id IS NULL)OR(target_type='none'AND task_id IS NULL AND habit_id IS NULL AND root_task_id IS NULL)),
 CHECK(mode='pomo'OR(phase='focus'AND planned_seconds=86400)),CHECK(phase='focus'OR target_type='none'),
 CHECK((status='running'AND run_started_at IS NOT NULL AND deadline_at IS NOT NULL AND ended_at IS NULL AND override_seconds IS NULL)OR(status='paused'AND run_started_at IS NULL AND deadline_at IS NULL AND ended_at IS NULL AND override_seconds IS NULL)OR(status IN('completed','cancelled')AND run_started_at IS NULL AND deadline_at IS NULL AND ended_at IS NOT NULL)),
 CHECK((source='manual'AND mode='stopwatch'AND phase='focus'AND status='completed'AND timer_generation=0)OR(source='timer'AND timer_generation>=1))
);
CREATE UNIQUE INDEX productivity_focus_one_active ON productivity_focus_sessions(owner_id)WHERE status IN('running','paused');
CREATE INDEX productivity_focus_owner_history ON productivity_focus_sessions(owner_id,started_at,id);
CREATE TABLE productivity_focus_segments(
 id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES productivity_focus_sessions(id),started_at TEXT NOT NULL,ended_at TEXT,elapsed_milliseconds INTEGER NOT NULL CHECK(elapsed_milliseconds BETWEEN 0 AND 86400000),
 CHECK(ended_at IS NOT NULL OR elapsed_milliseconds=0)
);
CREATE UNIQUE INDEX productivity_focus_one_open_segment ON productivity_focus_segments(session_id)WHERE ended_at IS NULL;
CREATE INDEX productivity_focus_segments_session ON productivity_focus_segments(session_id,started_at,id);
CREATE TABLE productivity_focus_audit(
 id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES productivity_focus_sessions(id),actor_id TEXT REFERENCES users(id),action TEXT NOT NULL,
 before_json TEXT,after_json TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE INDEX productivity_focus_audit_session ON productivity_focus_audit(session_id,created_at,id);
CREATE TABLE productivity_focus_notices(
 session_id TEXT PRIMARY KEY REFERENCES productivity_focus_sessions(id),owner_id TEXT NOT NULL REFERENCES users(id),eligible_at TEXT NOT NULL,available_at TEXT,
 state TEXT NOT NULL CHECK(state IN('pending','delivered','suppressed','consumed')),digest_id TEXT,notification_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
`;
export const productivityFocusChecksum=createHash('sha256').update(focusSchemaSql+'\ndurable-owner-focus-segments-capture-clock-v19-pilot').digest('hex');
/** Replacement recovery pauses at capture time, never restore downtime. No
 * completion counter or old phase notification is replayed. Ordinary restart
 * keeps the pending durable deadline instead of invoking this policy. */
function restoreFocus(tx:AppWriteTx,now:number,context:SnapshotRestoreContext):void {const capture=Date.parse(context.snapshotCreatedAt);for(const row of tx.all("SELECT * FROM productivity_focus_sessions WHERE status='running'")){if(row.revision>=Number.MAX_SAFE_INTEGER-1||row.timer_generation>=Number.MAX_SAFE_INTEGER-1)throw Error('Focus revision limit');const start=Date.parse(row.run_started_at),delta=Math.min(row.planned_seconds*1000-row.active_milliseconds,Math.max(0,capture-start)),end=new Date(start+delta).toISOString(),at=new Date(Math.max(now,capture,Date.parse(row.updated_at),start+delta)).toISOString();tx.run('UPDATE productivity_focus_segments SET ended_at=?,elapsed_milliseconds=? WHERE session_id=? AND ended_at IS NULL',end,delta,row.id);tx.run("UPDATE productivity_focus_sessions SET status='paused',active_milliseconds=active_milliseconds+?,run_started_at=NULL,deadline_at=NULL,revision=revision+1,timer_generation=timer_generation+1,updated_at=? WHERE id=?",delta,at,row.id);tx.run('INSERT INTO productivity_focus_audit VALUES(?,?,?,?,?,?,?,?)',randomUUID(),row.id,null,'restore_pause',JSON.stringify({status:row.status,activeMilliseconds:row.active_milliseconds}),JSON.stringify({status:'paused',activeMilliseconds:row.active_milliseconds+delta}),'Replacement snapshot requires review',at);}tx.run("UPDATE productivity_focus_notices SET state='consumed',available_at=NULL,updated_at=CASE WHEN updated_at>? THEN updated_at ELSE ? END WHERE state='pending'",new Date(now).toISOString(),new Date(now).toISOString());}
export function registerFocusMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable;registerRestorePolicy?:typeof registerSnapshotRestorePolicy}):void {for(const [table,columns]of Object.entries(focusTables))ports.registerSnapshot('productivity',table,columns);ports.registerMigration('productivity',19,(tx:AppWriteTx)=>tx.exec(focusSchemaSql),productivityFocusChecksum);ports.registerRestorePolicy?.('productivity','focus-pause-capture',19,restoreFocus);}
