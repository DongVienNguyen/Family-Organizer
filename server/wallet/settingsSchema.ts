import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import {normalizeWalletSettings} from '../../src/features/wallet/settingsContracts.js';
import {text,integer,object} from '../../src/features/productivity/validation.js';
export const walletSettingsSql=`
CREATE TABLE IF NOT EXISTS wallet_user_settings(owner_id TEXT PRIMARY KEY,value_json TEXT NOT NULL CHECK(json_valid(value_json) AND json_type(value_json)='object'),revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
`;
export const walletSettingsColumns={wallet_user_settings:['owner_id','value_json','revision','created_at','updated_at']} as const;
export const walletSettingsChecksum=createHash('sha256').update(walletSettingsSql+'\nwallet-user-settings-v16').digest('hex');
export function prepareWalletSettings(tx:AppWriteTx){tx.exec(walletSettingsSql);}
export const walletSettingsHash=(raw:unknown)=>createHash('sha256').update(JSON.stringify(normalizeWalletSettings(raw))).digest('hex');
export function validateWalletSettingsTables(tables:Record<string,Record<string,any>[]>,users?:Set<string>){const metadata=new Map(tables.wallet_audit_metadata.map(r=>[r.audit_id,r])),events=tables.wallet_audit.filter(r=>r.action==='wallet:settings:save');for(const r of tables.wallet_user_settings){text(r.owner_id,256);if(users&&!users.has(r.owner_id))throw Error('Unknown settings owner');integer(r.revision,1);const settings=normalizeWalletSettings(JSON.parse(r.value_json)),stamp=(v:unknown)=>{if(typeof v!=='string'||new Date(v).toISOString()!==v)throw Error('Invalid settings timestamp');return Date.parse(v);};if(stamp(r.created_at)>stamp(r.updated_at))throw Error('Invalid settings chronology');const own=events.filter(e=>e.actor_id===r.owner_id).map(e=>{const m=metadata.get(e.id);if(!m)throw Error('Missing settings audit');return {after:object(JSON.parse(m.after_json)),at:m.occurred_at};});if(!own.some(e=>e.after.ownerId===r.owner_id&&e.after.revision===r.revision&&e.after.settingsHash===walletSettingsHash(settings)&&e.at===r.updated_at))throw Error('Settings state differs from audit');}}
