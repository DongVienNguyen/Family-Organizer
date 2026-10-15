import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import type {registerDomainMigration} from '../appMigrations.js';
import {assertTaskView} from '../../src/features/productivity/contracts.js';
export const productivityGroupedViewChecksum=createHash('sha256').update('saved-view-tag-group-format-v9').digest('hex');
/** Explicit semantic JSON boundary only: do not create tables or rewrite views. */
function migrateGroupedViews(tx:AppWriteTx):void {
 for(const row of tx.all('SELECT * FROM productivity_views'))assertTaskView({id:row.id,ownerId:row.owner_id,revision:row.revision,filter:JSON.parse(row.filter_json),kind:row.kind,config:JSON.parse(row.config_json)},8);
}
export function registerGroupedViewMigration(register:typeof registerDomainMigration):void {register('productivity',9,migrateGroupedViews,productivityGroupedViewChecksum);}
