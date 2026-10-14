import type {AppWriteTx} from '../appStore.js';
import {assertTaskTree,edge} from './structureInvariant.js';
import {productivityTables,schemaSql} from './schema.js';
export const structureTables={
 productivity_catalog_revisions:['entity_kind','entity_id','revision','archived_at'],
 productivity_check_items:['id','task_id','text','is_done','rank'],
} as const;
export const structureSchemaSql=`
CREATE TABLE productivity_catalog_revisions(
 entity_kind TEXT NOT NULL CHECK(entity_kind IN('list','section','tag')),entity_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>=1),archived_at TEXT,PRIMARY KEY(entity_kind,entity_id)
);
CREATE TABLE productivity_check_items(
 id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES productivity_tasks(id) ON DELETE CASCADE,
 text TEXT NOT NULL,is_done INTEGER NOT NULL CHECK(is_done IN(0,1)),rank INTEGER NOT NULL,
 UNIQUE(task_id,rank)
);
CREATE INDEX productivity_tasks_parent ON productivity_tasks(parent_id,deleted_at);
CREATE INDEX productivity_check_items_task ON productivity_check_items(task_id,rank,id);
`;
export function productivityTablesAt(version:number){return version===2?{...productivityTables,...structureTables}:productivityTables;}
export function productivitySchemaAt(version:number):string{return schemaSql+(version===2?structureSchemaSql:'');}
export function migrateStructure(tx:AppWriteTx):void {
 assertTaskTree(tx.all('SELECT id,list_id,parent_id,creator_id,assignee_id,is_shared,deleted_at FROM productivity_tasks').map(edge));
 tx.exec(structureSchemaSql);
 for(const [kind,table] of [['list','productivity_lists'],['section','productivity_sections'],['tag','productivity_tags']])tx.run(`INSERT INTO productivity_catalog_revisions(entity_kind,entity_id,revision,archived_at) SELECT ?,id,1,NULL FROM ${table}`,kind);
}
