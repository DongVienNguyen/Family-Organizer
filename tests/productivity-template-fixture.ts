import {setupTaskNotifications,reader,write,migrations,snapshots,gateway} from './productivity-notification-fixture.js';
import {registerTaskTemplateMigration} from '../server/productivity/templateSchema.js';
import {createTaskTemplates} from '../server/productivity/templates.js';
export * from './productivity-notification-fixture.js';
export const templates=createTaskTemplates({reader,write:gateway.withAppWriteTransaction});
export function setupTaskTemplates(){setupTaskNotifications();registerTaskTemplateMigration({registerMigration:migrations.registerDomainMigration,registerSnapshot:snapshots.registerSnapshotTable});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});}
