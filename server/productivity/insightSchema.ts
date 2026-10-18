import {createHash} from 'node:crypto';import type {AppWriteTx} from '../appStore.js';import type {registerDomainMigration} from '../appMigrations.js';import type {registerSnapshotTable} from '../appSnapshot.js';
export const insightTables={
 productivity_insight_meta:['id','high_sequence','capture_started_at'],
 productivity_insight_events:['sequence','task_id','task_revision','kind','occurred_at','before_json','after_json','accepted_completion'],
 productivity_review_notes:['id','owner_id','from_date','to_date_exclusive','timezone','content','revision','captured_at','capture_sequence','scope_task_ids_json','focus_facts_json','created_at','updated_at'],
 productivity_review_note_revisions:['id','note_id','revision','content','captured_at','capture_sequence','scope_task_ids_json','focus_facts_json','created_at'],
}as const;
export const insightSchemaSql=`
CREATE TABLE productivity_insight_meta(id TEXT PRIMARY KEY CHECK(id='global'),high_sequence INTEGER NOT NULL CHECK(high_sequence>=0),capture_started_at TEXT NOT NULL);
CREATE TABLE productivity_insight_events(
 sequence INTEGER PRIMARY KEY CHECK(sequence>=1),task_id TEXT NOT NULL REFERENCES productivity_tasks(id)ON DELETE CASCADE,task_revision INTEGER NOT NULL CHECK(task_revision>=0),kind TEXT NOT NULL CHECK(kind IN('created','changed')),occurred_at TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL,accepted_completion INTEGER NOT NULL CHECK(accepted_completion IN(0,1)),UNIQUE(task_id,task_revision),CHECK((kind='created')=(before_json IS NULL))
);
CREATE INDEX productivity_insight_events_task ON productivity_insight_events(task_id,sequence);
CREATE INDEX productivity_insight_events_time ON productivity_insight_events(occurred_at,sequence);
CREATE TABLE productivity_review_notes(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),from_date TEXT NOT NULL,to_date_exclusive TEXT NOT NULL,timezone TEXT NOT NULL,content TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),captured_at TEXT NOT NULL,capture_sequence INTEGER NOT NULL CHECK(capture_sequence>=0),scope_task_ids_json TEXT NOT NULL,focus_facts_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX productivity_review_notes_owner ON productivity_review_notes(owner_id,created_at,id);
CREATE TABLE productivity_review_note_revisions(
 id TEXT PRIMARY KEY,note_id TEXT NOT NULL REFERENCES productivity_review_notes(id),revision INTEGER NOT NULL CHECK(revision>=1),content TEXT NOT NULL,captured_at TEXT NOT NULL,capture_sequence INTEGER NOT NULL CHECK(capture_sequence>=0),scope_task_ids_json TEXT NOT NULL,focus_facts_json TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(note_id,revision)
);
`;
export const productivityInsightChecksum=createHash('sha256').update(insightSchemaSql+'\ncaptured-root-episodes-owner-review-watermark-v22-pilot').digest('hex');
export function registerInsightMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable}):void {for(const [table,columns]of Object.entries(insightTables))ports.registerSnapshot('productivity',table,columns);ports.registerMigration('productivity',22,(tx:AppWriteTx)=>{tx.exec(insightSchemaSql);tx.run("INSERT INTO productivity_insight_meta VALUES('global',0,?)",new Date().toISOString());},productivityInsightChecksum);}
