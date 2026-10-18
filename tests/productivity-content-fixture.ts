import {setupTaskTemplates,reader,gateway,migrations,snapshots} from './productivity-template-fixture.js';
import {registerTaskContentMigration} from '../server/productivity/contentSchema.js';
import {createTaskContent} from '../server/productivity/content.js';
import {FamilyDB} from '../server/db.js';
export * from './productivity-template-fixture.js';
export const content=createTaskContent({reader,write:gateway.withAppWriteTransaction,legacy:FamilyDB});
export function setupTaskContent(){setupTaskTemplates();registerTaskContentMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});}
