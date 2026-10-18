import {productivitySettingsTables,productivitySettingsSql,productivitySettingsChecksum} from './settingsSchema.js';
import {insightTables,insightSchemaSql,productivityInsightChecksum} from './insightSchema.js';
import {trackingReminderTables,trackingReminderSchemaSql,productivityTrackingReminderChecksum} from './trackingReminderSchema.js';
import {habitTables,habitSchemaSql,productivityHabitChecksum} from './habitSchema.js';
import {focusTables,focusSchemaSql,productivityFocusChecksum} from './focusSchema.js';
import {taskImportTables,taskImportSchemaSql,productivityTaskImportChecksum} from './importSchema.js';
import {taskAttachmentTables,taskAttachmentSchemaSql,productivityTaskAttachmentChecksum} from './taskAttachmentSchema.js';
import {taskContentTables,taskContentSchemaSql,productivityTaskContentChecksum} from './contentSchema.js';
import {taskTemplateTables,taskTemplateSchemaSql,productivityTaskTemplateChecksum} from './templateSchema.js';
import {taskNotificationTables,taskNotificationSchemaSql,productivityTaskNotificationChecksum} from './notificationSchema.js';
import {productivityVersionsFrom} from './knownVersions.js';
import {legacyCutoverTables,legacyCutoverSchemaSql,productivityLegacyCutoverChecksum} from './legacyCutoverSchema.js';
import {occurrenceSkipTables,occurrenceSkipSchemaSql,productivityOccurrenceSkipChecksum} from './occurrenceSkipSchema.js';
import {ownedOccurrenceTables,ownedOccurrenceSchemaSql,productivityOccurrenceChecksum} from './occurrenceSchema.js';
import {seriesTables,seriesSchemaSql,productivitySeriesChecksum} from './seriesSchema.js';
import {productivityGroupedViewChecksum} from './groupViewSchema.js';
import {productivityBoardViewChecksum} from './boardViewSchema.js';
import {boardTables,inspectBoardSchema} from './boardSchema.js';
import {productivityBoardChecksum} from './boardMigration.js';
import {matrixTables,inspectMatrixSchema,productivityMatrixChecksum} from './matrixSchema.js';
import {inspectWalletStorage} from '../wallet/integration.js';
import {viewTables} from './viewSchema.js';
import {taskPinTables} from './pinSchema.js';
import {tagOwnershipTables} from './tagSchema.js';
import type {AppWriteTx} from '../appStore.js';
import {productivityTables} from './schema.js';
import {productivityMigrationChecksum,productivityStructureChecksum,productivityTagChecksum,productivityPinChecksum,productivityViewChecksum} from './migrate.js';
import {structureTables,productivityTablesAt} from './structureSchema.js';
type Reader=Pick<AppWriteTx,'get'|'all'>;
/** Inspect persisted compatibility only; damaged data is validated by ordinary
 * bootstrap or the authenticated replacement snapshot, never by this schema gate. */
export function inspectProductivityStorage(reader:Reader):boolean {
 inspectWalletStorage(reader);
 const names=new Set(reader.all("SELECT name FROM sqlite_master WHERE type='table'").map(row=>row.name));
 if([...names].some(name=>name.startsWith('productivity_')&&!Object.hasOwn({...productivityTables,...structureTables,...tagOwnershipTables,...taskPinTables,...viewTables,...matrixTables,...boardTables,...seriesTables,...ownedOccurrenceTables,...occurrenceSkipTables,...legacyCutoverTables,...taskNotificationTables,...taskTemplateTables,...taskContentTables,...taskAttachmentTables,...taskImportTables,...focusTables,...habitTables,...trackingReminderTables,...insightTables,...productivitySettingsTables},name)))throw new Error('Unsupported domain storage table');
 const records=names.has('app_migrations')?reader.all('SELECT namespace,version,checksum FROM app_migrations ORDER BY namespace,version'):[];
 if(records.some(row=>row.namespace!=='productivity'&&row.namespace!=='wallet'))throw new Error('Unsupported domain migration namespace');
 const applied=records.filter(row=>row.namespace==='productivity');
 const present=Object.keys({...productivityTables,...structureTables,...tagOwnershipTables,...taskPinTables,...viewTables,...matrixTables,...boardTables,...seriesTables,...ownedOccurrenceTables,...occurrenceSkipTables,...legacyCutoverTables,...taskNotificationTables,...taskTemplateTables,...taskContentTables,...taskAttachmentTables,...taskImportTables,...focusTables,...habitTables,...trackingReminderTables,...insightTables,...productivitySettingsTables}).filter(name=>names.has(name));
 const marker=reader.get("SELECT value FROM app_meta WHERE key='productivity_active'")?.value;
 if(!present.length&&!applied.length&&marker===undefined)return false;
 if(!productivityVersionsFrom(1).includes(applied.length)||applied[0].version!==1||applied[0].checksum!==productivityMigrationChecksum||(applied.length>=2&&(applied[1].version!==2||applied[1].checksum!==productivityStructureChecksum)))throw new Error('Unsupported productivity migration');
 if(applied.length>=3&&(applied[2].version!==3||applied[2].checksum!==productivityTagChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=4&&(applied[3].version!==4||applied[3].checksum!==productivityPinChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=5&&(applied[4].version!==5||applied[4].checksum!==productivityViewChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=6&&(applied[5].version!==6||applied[5].checksum!==productivityMatrixChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=7&&(applied[6].version!==7||applied[6].checksum!==productivityBoardChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=8&&(applied[7].version!==8||applied[7].checksum!==productivityBoardViewChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=9&&(applied[8].version!==9||applied[8].checksum!==productivityGroupedViewChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=10&&(applied[9].version!==10||applied[9].checksum!==productivitySeriesChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=11&&(applied[10].version!==11||applied[10].checksum!==productivityOccurrenceChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=12&&(applied[11].version!==12||applied[11].checksum!==productivityOccurrenceSkipChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=13&&(applied[12].version!==13||applied[12].checksum!==productivityLegacyCutoverChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=14&&(applied[13].version!==14||applied[13].checksum!==productivityTaskNotificationChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=15&&(applied[14].version!==15||applied[14].checksum!==productivityTaskTemplateChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=16&&(applied[15].version!==16||applied[15].checksum!==productivityTaskContentChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=17&&(applied[16].version!==17||applied[16].checksum!==productivityTaskAttachmentChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=18&&(applied[17].version!==18||applied[17].checksum!==productivityTaskImportChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=19&&(applied[18].version!==19||applied[18].checksum!==productivityFocusChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=20&&(applied[19].version!==20||applied[19].checksum!==productivityHabitChecksum))throw new Error('Unsupported productivity migration');
 if(applied.length>=23&&(applied[22].version!==23||applied[22].checksum!==productivitySettingsChecksum))throw new Error('Unsupported productivity settings migration');
 if(applied.length<23&&Object.keys(productivitySettingsTables).some(name=>names.has(name)))throw new Error('Unsupported productivity settings schema');
 if(applied.length>=23)for(const statement of productivitySettingsSql.split(';').map(sql=>sql.trim()).filter(Boolean)){const match=statement.match(/^CREATE (?:UNIQUE )?(TABLE|INDEX) ([a-z_]+)/),kind=match?.[1].toLowerCase(),name=match?.[2],actual=name&&reader.get("SELECT sql FROM sqlite_master WHERE type=? AND name=?",kind,name)?.sql;if(typeof actual!=='string'||actual.trim().replace(/\s+/g,' ')!==statement.replace(/\s+/g,' '))throw new Error('Unsupported productivity settings schema');}
 if(applied.length>=22&&(applied[21].version!==22||applied[21].checksum!==productivityInsightChecksum))throw new Error('Unsupported insight migration');
 if(applied.length<22&&Object.keys(insightTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=22)for(const statement of insightSchemaSql.split(';').map(sql=>sql.trim()).filter(Boolean)){const match=statement.match(/^CREATE (?:UNIQUE )?(TABLE|INDEX) ([a-z_]+)/),kind=match?.[1].toLowerCase(),name=match?.[2],actual=name&&reader.get("SELECT sql FROM sqlite_master WHERE type=? AND name=?",kind,name)?.sql;if(typeof actual!=='string'||actual.trim().replace(/\s+/g,' ')!==statement.replace(/\s+/g,' '))throw new Error('Unsupported insight schema');}
 if(applied.length>=21&&(applied[20].version!==21||applied[20].checksum!==productivityTrackingReminderChecksum))throw new Error('Unsupported tracking reminder migration');
 if(applied.length<21&&Object.keys(trackingReminderTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=21)for(const statement of trackingReminderSchemaSql.split(';').map(sql=>sql.trim()).filter(Boolean)){const match=statement.match(/^CREATE (?:UNIQUE )?(TABLE|INDEX) ([a-z_]+)/),kind=match?.[1].toLowerCase(),name=match?.[2],actual=name&&reader.get("SELECT sql FROM sqlite_master WHERE type=? AND name=?",kind,name)?.sql;if(typeof actual!=='string'||actual.trim().replace(/\s+/g,' ')!==statement.replace(/\s+/g,' '))throw new Error('Unsupported tracking reminder schema');}
 if(applied.length<20&&Object.keys(habitTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=20)for(const statement of habitSchemaSql.split(';').map(sql=>sql.trim()).filter(Boolean)){const match=statement.match(/^CREATE (?:UNIQUE )?(TABLE|INDEX) ([a-z_]+)/),kind=match?.[1].toLowerCase(),name=match?.[2],actual=name&&reader.get("SELECT sql FROM sqlite_master WHERE type=? AND name=?",kind,name)?.sql;if(typeof actual!=='string'||actual.trim().replace(/\s+/g,' ')!==statement.replace(/\s+/g,' '))throw new Error('Unsupported habit/countdown schema');}
 if(applied.length<19&&Object.keys(focusTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=19)for(const statement of focusSchemaSql.split(';').map(sql=>sql.trim()).filter(Boolean)){const match=statement.match(/^CREATE (?:UNIQUE )?(TABLE|INDEX) ([a-z_]+)/),kind=match?.[1].toLowerCase(),name=match?.[2],actual=name&&reader.get("SELECT sql FROM sqlite_master WHERE type=? AND name=?",kind,name)?.sql;if(typeof actual!=='string'||actual.trim().replace(/\s+/g,' ')!==statement.replace(/\s+/g,' '))throw new Error('Unsupported Focus schema');}
 if(applied.length<18&&Object.keys(taskImportTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=18)for(const statement of taskImportSchemaSql.split(';').map(sql=>sql.trim()).filter(Boolean)){const match=statement.match(/^CREATE (TABLE|INDEX) ([a-z_]+)/),kind=match?.[1].toLowerCase(),name=match?.[2],actual=name&&reader.get("SELECT sql FROM sqlite_master WHERE type=? AND name=?",kind,name)?.sql;if(typeof actual!=='string'||actual.trim().replace(/\s+/g,' ')!==statement.replace(/\s+/g,' '))throw new Error('Unsupported task import schema');}
 if(applied.length<17&&Object.keys(taskAttachmentTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=17)for(const statement of taskAttachmentSchemaSql.split(';').map(sql=>sql.trim()).filter(Boolean)){const match=statement.match(/^CREATE (TABLE|INDEX) ([a-z_]+)/),kind=match?.[1].toLowerCase(),name=match?.[2],actual=name&&reader.get("SELECT sql FROM sqlite_master WHERE type=? AND name=?",kind,name)?.sql;if(typeof actual!=='string'||actual.trim().replace(/\s+/g,' ')!==statement.replace(/\s+/g,' '))throw new Error('Unsupported task attachment schema');}
 if(applied.length<16&&Object.keys(taskContentTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=16)for(const statement of taskContentSchemaSql.split(';').map(sql=>sql.trim()).filter(Boolean)){const match=statement.match(/^CREATE (TABLE|INDEX) ([a-z_]+)/),kind=match?.[1].toLowerCase(),name=match?.[2],actual=name&&reader.get("SELECT sql FROM sqlite_master WHERE type=? AND name=?",kind,name)?.sql;if(typeof actual!=='string'||actual.trim().replace(/\s+/g,' ')!==statement.replace(/\s+/g,' '))throw new Error('Unsupported task content schema');}
 if(applied.length<15&&Object.keys(taskTemplateTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=15)for(const statement of taskTemplateSchemaSql.split(';').map(sql=>sql.trim()).filter(Boolean)){const match=statement.match(/^CREATE (TABLE|INDEX) ([a-z_]+)/),kind=match?.[1].toLowerCase(),name=match?.[2],actual=name&&reader.get("SELECT sql FROM sqlite_master WHERE type=? AND name=?",kind,name)?.sql;if(typeof actual!=='string'||actual.trim().replace(/\s+/g,' ')!==statement.replace(/\s+/g,' '))throw new Error('Unsupported task template schema');}
 if(applied.length<14&&Object.keys(taskNotificationTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=14)for(const statement of taskNotificationSchemaSql.split(';').map(sql=>sql.trim()).filter(Boolean)){const match=statement.match(/^CREATE (TABLE|INDEX) ([a-z_]+)/),kind=match?.[1].toLowerCase(),name=match?.[2],actual=name&&reader.get("SELECT sql FROM sqlite_master WHERE type=? AND name=?",kind,name)?.sql;if(typeof actual!=='string'||actual.trim().replace(/\s+/g,' ')!==statement.replace(/\s+/g,' '))throw new Error('Unsupported task notification schema');}
 if(applied.length<13&&Object.keys(legacyCutoverTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=13)for(const statement of legacyCutoverSchemaSql.split(';').map(sql=>sql.trim()).filter(Boolean)){const name=statement.match(/^CREATE TABLE ([a-z_]+)/)?.[1],actual=name&&reader.get("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",name)?.sql;if(typeof actual!=='string'||actual.trim().replace(/\s+/g,' ')!==statement.replace(/\s+/g,' '))throw new Error('Unsupported legacy cutover schema');}
 if(applied.length<12&&Object.keys(occurrenceSkipTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=12)for(const statement of occurrenceSkipSchemaSql.split(';').map(sql=>sql.trim()).filter(Boolean)){const name=statement.match(/^CREATE TABLE ([a-z_]+)/)?.[1],actual=name&&reader.get("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",name)?.sql;if(typeof actual!=='string'||actual.trim().replace(/\s+/g,' ')!==statement.replace(/\s+/g,' '))throw new Error('Unsupported occurrence skip schema');}
 if(applied.length<11&&Object.keys(ownedOccurrenceTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=11)for(const statement of ownedOccurrenceSchemaSql.split(';').map(sql=>sql.trim()).filter(Boolean)){const name=statement.match(/^CREATE TABLE ([a-z_]+)/)?.[1],actual=name&&reader.get("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",name)?.sql;if(typeof actual!=='string'||actual.trim().replace(/\s+/g,' ')!==statement.replace(/\s+/g,' '))throw new Error('Unsupported owned occurrence schema');}
 if(applied.length<10&&Object.keys(seriesTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=10)for(const statement of seriesSchemaSql.split(';').map(sql=>sql.trim()).filter(Boolean)){const name=statement.match(/^CREATE TABLE ([a-z_]+)/)?.[1],actual=name&&reader.get("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",name)?.sql;if(typeof actual!=='string'||actual.trim().replace(/\s+/g,' ')!==statement.replace(/\s+/g,' '))throw new Error('Unsupported recurrence series schema');}
 if(applied.length<7&&(Object.keys(boardTables).some(name=>names.has(name))||reader.get("SELECT name FROM sqlite_master WHERE type='index' AND name IN('productivity_tasks_board_identity','productivity_board_positions_lane')")))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=7)inspectBoardSchema(reader);
 if(applied.length<6&&Object.keys(matrixTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length>=6)inspectMatrixSchema(reader);
 if(applied.length<5&&Object.keys(viewTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length<4&&Object.keys(taskPinTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length<3&&Object.keys(tagOwnershipTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(applied.length===1&&Object.keys(structureTables).some(name=>names.has(name)))throw new Error('Unsupported productivity storage schema');
 if(marker!==undefined&&marker!=='1')throw new Error('Unsupported canonical task marker');
 for(const [name,columns] of Object.entries(productivityTablesAt(applied.length))){
  if(!names.has(name)||JSON.stringify(reader.all(`PRAGMA table_info(${name})`).map(row=>row.name))!==JSON.stringify(columns))throw new Error('Unsupported productivity storage schema');
 }
 return true;
}
