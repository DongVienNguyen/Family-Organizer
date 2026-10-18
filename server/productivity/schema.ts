import type {AppWriteTx} from '../appStore.js';
export const taskColumns=['id','list_id','section_id','parent_id','title','body','lifecycle','priority','due_kind','due_date','due_instant','due_timezone','scheduled_start','scheduled_end','creator_id','assignee_id','is_shared','blocked','blocked_reason','pending_approval','reward_points','revision','deleted_at','rank','legacy_json'] as const;
export const productivityTables={
 productivity_lists:['id','title','owner_id','is_shared'],
 productivity_sections:['id','list_id','title'],
 productivity_tags:['id','name'],
 productivity_tasks:taskColumns,
 productivity_task_tags:['task_id','tag_id'],
 productivity_list_grants:['list_id','user_id','permission'],
 productivity_occurrences:['id','task_id','series_id','occurrence_key','ordinal','payload_json'],
 productivity_matrix_pins:['view_id','task_id','quadrant'],
} as const;
export const schemaSql=`
CREATE TABLE IF NOT EXISTS productivity_lists(id TEXT PRIMARY KEY,title TEXT NOT NULL,owner_id TEXT NOT NULL,is_shared INTEGER NOT NULL CHECK(is_shared IN(0,1)));
CREATE TABLE IF NOT EXISTS productivity_sections(id TEXT PRIMARY KEY,list_id TEXT NOT NULL REFERENCES productivity_lists(id),title TEXT NOT NULL,UNIQUE(id,list_id));
CREATE TABLE IF NOT EXISTS productivity_tags(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS productivity_tasks(
 id TEXT PRIMARY KEY,list_id TEXT NOT NULL REFERENCES productivity_lists(id),section_id TEXT,parent_id TEXT REFERENCES productivity_tasks(id) DEFERRABLE INITIALLY DEFERRED,
 title TEXT NOT NULL,body TEXT NOT NULL,lifecycle TEXT NOT NULL CHECK(lifecycle IN('todo','in_progress','completed','wont_do')),priority TEXT NOT NULL CHECK(priority IN('high','medium','low','none')),
 due_kind TEXT NOT NULL CHECK(due_kind IN('none','all_day','timed')),due_date TEXT,due_instant TEXT,due_timezone TEXT,
 scheduled_start TEXT,scheduled_end TEXT,creator_id TEXT NOT NULL,assignee_id TEXT,is_shared INTEGER NOT NULL CHECK(is_shared IN(0,1)),blocked INTEGER NOT NULL CHECK(blocked IN(0,1)),blocked_reason TEXT,
 pending_approval INTEGER NOT NULL CHECK(pending_approval IN(0,1)),reward_points INTEGER NOT NULL CHECK(reward_points>=0),revision INTEGER NOT NULL CHECK(revision>=0),deleted_at TEXT,rank INTEGER NOT NULL,legacy_json TEXT NOT NULL,
 FOREIGN KEY(section_id,list_id) REFERENCES productivity_sections(id,list_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((due_kind='none' AND due_date IS NULL AND due_instant IS NULL AND due_timezone IS NULL) OR (due_kind='all_day' AND due_date IS NOT NULL AND due_instant IS NULL AND due_timezone IS NOT NULL) OR (due_kind='timed' AND due_date IS NULL AND due_instant IS NOT NULL AND due_timezone IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS productivity_tasks_list_rank ON productivity_tasks(list_id,rank,id);
CREATE INDEX IF NOT EXISTS productivity_tasks_actor ON productivity_tasks(assignee_id,lifecycle,id);
CREATE INDEX IF NOT EXISTS productivity_tasks_due ON productivity_tasks(due_kind,due_date,due_instant,id);
CREATE TABLE IF NOT EXISTS productivity_task_tags(task_id TEXT NOT NULL REFERENCES productivity_tasks(id) ON DELETE CASCADE,tag_id TEXT NOT NULL REFERENCES productivity_tags(id),PRIMARY KEY(task_id,tag_id));
CREATE TABLE IF NOT EXISTS productivity_list_grants(list_id TEXT NOT NULL REFERENCES productivity_lists(id),user_id TEXT NOT NULL,permission TEXT NOT NULL CHECK(permission IN('read','write','manage')),PRIMARY KEY(list_id,user_id));
CREATE TABLE IF NOT EXISTS productivity_occurrences(id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES productivity_tasks(id),series_id TEXT NOT NULL,occurrence_key TEXT NOT NULL,ordinal INTEGER NOT NULL CHECK(ordinal>=0),payload_json TEXT NOT NULL,UNIQUE(series_id,occurrence_key));
CREATE TABLE IF NOT EXISTS productivity_matrix_pins(view_id TEXT NOT NULL,task_id TEXT NOT NULL REFERENCES productivity_tasks(id) ON DELETE CASCADE,quadrant TEXT NOT NULL CHECK(quadrant IN('q1','q2','q3','q4')),PRIMARY KEY(view_id,task_id));
`;
/** Trusted pilot transaction only. No schema or connection work happens on import. */
export function preparePilotSchema(tx:AppWriteTx):void {tx.exec(schemaSql);}
