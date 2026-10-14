import type {AppWriteTx} from '../appStore.js';
export const taskPinTables={productivity_task_pins:['user_id','task_id','is_pinned','revision']} as const;
export const taskPinSchemaSql=`CREATE TABLE productivity_task_pins(
 user_id TEXT NOT NULL,
 task_id TEXT NOT NULL REFERENCES productivity_tasks(id) ON DELETE CASCADE,
 is_pinned INTEGER NOT NULL CHECK(is_pinned IN(0,1)),
 revision INTEGER NOT NULL CHECK(revision>=1),
 PRIMARY KEY(user_id,task_id)
);
CREATE INDEX productivity_task_pins_task ON productivity_task_pins(task_id,user_id);
`;
export function migrateTaskPins(tx:AppWriteTx):void {tx.exec(taskPinSchemaSql);}
