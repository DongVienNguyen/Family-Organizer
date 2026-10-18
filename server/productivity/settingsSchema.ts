import {createHash} from 'node:crypto';import type {AppWriteTx} from '../appStore.js';import type {registerDomainMigration} from '../appMigrations.js';import type {registerSnapshotTable} from '../appSnapshot.js';
export const productivitySettingsTables={productivity_user_settings:['owner_id','revision','settings_json','created_at','updated_at'],productivity_settings_revisions:['id','owner_id','revision','settings_json','created_at']}as const;
export const productivitySettingsSql=`
CREATE TABLE productivity_user_settings(owner_id TEXT PRIMARY KEY REFERENCES users(id),revision INTEGER NOT NULL CHECK(revision>=1),settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE productivity_settings_revisions(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),revision INTEGER NOT NULL CHECK(revision>=1),settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),created_at TEXT NOT NULL,UNIQUE(owner_id,revision));
`;
export const productivitySettingsChecksum=createHash('sha256').update(productivitySettingsSql+'\nprivate-user-preferences-explicit-v23-pilot').digest('hex');
export function registerProductivitySettingsMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable}){for(const [name,columns]of Object.entries(productivitySettingsTables))ports.registerSnapshot('productivity',name,columns);ports.registerMigration('productivity',23,(tx:AppWriteTx)=>tx.exec(productivitySettingsSql),productivitySettingsChecksum);}
