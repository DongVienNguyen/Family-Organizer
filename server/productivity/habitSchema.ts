import {createHash} from 'node:crypto';import type {AppWriteTx} from '../appStore.js';import type {registerDomainMigration} from '../appMigrations.js';import type {registerSnapshotTable} from '../appSnapshot.js';
export const habitTables={
 productivity_habits:['id','owner_id','title','note','is_shared','revision','start_date','archived_at','archived_local_date','created_at','updated_at'],
 productivity_habit_definitions:['habit_id','revision','effective_date','policy_json','created_at'],
 productivity_habit_logs:['id','habit_id','user_id','local_date','value','status','definition_revision','goal_json','timezone','revision','created_at','updated_at'],
 productivity_habit_log_audit:['id','log_id','actor_id','before_json','after_json','reason','created_at'],
 productivity_countdowns:['id','owner_id','title','note','is_shared','policy_json','revision','archived_at','created_at','updated_at'],
}as const;
export const habitSchemaSql=`
CREATE TABLE productivity_habits(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,note TEXT NOT NULL,is_shared INTEGER NOT NULL CHECK(is_shared IN(0,1)),revision INTEGER NOT NULL CHECK(revision>=1),start_date TEXT NOT NULL,
 archived_at TEXT,archived_local_date TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,CHECK((archived_at IS NULL)=(archived_local_date IS NULL))
);
CREATE INDEX productivity_habits_owner ON productivity_habits(owner_id,archived_at,created_at,id);
CREATE INDEX productivity_habits_family ON productivity_habits(is_shared,archived_at,created_at,id);
CREATE TABLE productivity_habit_definitions(
 habit_id TEXT NOT NULL REFERENCES productivity_habits(id),revision INTEGER NOT NULL CHECK(revision>=1),effective_date TEXT NOT NULL,policy_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(habit_id,revision)
);
CREATE INDEX productivity_habit_policy_dates ON productivity_habit_definitions(habit_id,effective_date,revision);
CREATE TABLE productivity_habit_logs(
 id TEXT PRIMARY KEY,habit_id TEXT NOT NULL REFERENCES productivity_habits(id),user_id TEXT NOT NULL REFERENCES users(id),local_date TEXT NOT NULL,
 value REAL NOT NULL CHECK(value>=0 AND value<=1000000000),status TEXT NOT NULL CHECK(status IN('done','skip')),definition_revision INTEGER NOT NULL,
 goal_json TEXT NOT NULL,timezone TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(habit_id,user_id,local_date),FOREIGN KEY(habit_id,definition_revision)REFERENCES productivity_habit_definitions(habit_id,revision),CHECK(status!='skip'OR value=0)
);
CREATE INDEX productivity_habit_logs_actor ON productivity_habit_logs(user_id,habit_id,local_date);
CREATE TABLE productivity_habit_log_audit(
 id TEXT PRIMARY KEY,log_id TEXT NOT NULL REFERENCES productivity_habit_logs(id),actor_id TEXT NOT NULL REFERENCES users(id),before_json TEXT,after_json TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE INDEX productivity_habit_log_audit_log ON productivity_habit_log_audit(log_id,created_at,id);
CREATE TABLE productivity_countdowns(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,note TEXT NOT NULL,is_shared INTEGER NOT NULL CHECK(is_shared IN(0,1)),policy_json TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),archived_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX productivity_countdowns_owner ON productivity_countdowns(owner_id,archived_at,created_at,id);
CREATE INDEX productivity_countdowns_family ON productivity_countdowns(is_shared,archived_at,created_at,id);
`;
export const productivityHabitChecksum=createHash('sha256').update(habitSchemaSql+'\nactor-local-date-habits-versioned-policy-countdown-v20-pilot').digest('hex');
export function registerHabitMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable}):void {for(const [table,columns]of Object.entries(habitTables))ports.registerSnapshot('productivity',table,columns);ports.registerMigration('productivity',20,(tx:AppWriteTx)=>tx.exec(habitSchemaSql),productivityHabitChecksum);}
