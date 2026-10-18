import {focusTables,focusSchemaSql} from './focusSchema.js';
import {taskImportTables,taskImportSchemaSql} from './importSchema.js';
import {taskAttachmentTables,taskAttachmentSchemaSql} from './taskAttachmentSchema.js';
import {taskContentTables,taskContentSchemaSql} from './contentSchema.js';
import {taskTemplateTables,taskTemplateSchemaSql} from './templateSchema.js';
import {taskNotificationTables,taskNotificationSchemaSql} from './notificationSchema.js';
import {legacyCutoverTables,legacyCutoverSchemaSql} from './legacyCutoverSchema.js';
import {occurrenceSkipTables,occurrenceSkipSchemaSql} from './occurrenceSkipSchema.js';
import {ownedOccurrenceTables,ownedOccurrenceSchemaSql} from './occurrenceSchema.js';
import {seriesTables,seriesSchemaSql} from './seriesSchema.js';
import {boardTables,boardSchemaSql} from './boardSchema.js';
import {matrixTables,matrixPinSchemaSql} from './matrixSchema.js';
import {viewTables,viewSchemaSql} from './viewSchema.js';
import {taskPinTables,taskPinSchemaSql} from './pinSchema.js';
import {tagOwnershipTables,tagOwnershipSchemaSql} from './tagSchema.js';
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
export function productivityTablesAt(version:number){return version>=2?{...productivityTables,...structureTables,...(version>=3?tagOwnershipTables:{}),...(version>=4?taskPinTables:{}),...(version>=5?viewTables:{}),...(version>=6?matrixTables:{}),...(version>=7?boardTables:{}),...(version>=10?seriesTables:{}),...(version>=11?ownedOccurrenceTables:{}),...(version>=12?occurrenceSkipTables:{}),...(version>=13?legacyCutoverTables:{}),...(version>=14?taskNotificationTables:{}),...(version>=15?taskTemplateTables:{}),...(version>=16?taskContentTables:{}),...(version>=17?taskAttachmentTables:{}),...(version>=18?taskImportTables:{}),...(version>=19?focusTables:{})}:productivityTables;}
export function productivitySchemaAt(version:number):string{return schemaSql+(version>=2?structureSchemaSql:'')+(version>=3?tagOwnershipSchemaSql:'')+(version>=4?taskPinSchemaSql:'')+(version>=5?viewSchemaSql:'')+(version>=6?matrixPinSchemaSql:'')+(version>=7?boardSchemaSql:'')+(version>=10?seriesSchemaSql:'')+(version>=11?ownedOccurrenceSchemaSql:'')+(version>=12?occurrenceSkipSchemaSql:'')+(version>=13?legacyCutoverSchemaSql:'')+(version>=14?taskNotificationSchemaSql:'')+(version>=15?taskTemplateSchemaSql:'')+(version>=16?taskContentSchemaSql:'')+(version>=17?taskAttachmentSchemaSql:'')+(version>=18?taskImportSchemaSql:'')+(version>=19?focusSchemaSql:'');}
export function migrateStructure(tx:AppWriteTx):void {
 assertTaskTree(tx.all('SELECT id,list_id,parent_id,creator_id,assignee_id,is_shared,deleted_at FROM productivity_tasks').map(edge));
 tx.exec(structureSchemaSql);
 for(const [kind,table] of [['list','productivity_lists'],['section','productivity_sections'],['tag','productivity_tags']])tx.run(`INSERT INTO productivity_catalog_revisions(entity_kind,entity_id,revision,archived_at) SELECT ?,id,1,NULL FROM ${table}`,kind);
}
