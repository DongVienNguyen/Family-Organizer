import {validateSeriesStorage} from './seriesRecord.js';
import {validateBoardViewStorage} from './boardViewSchema.js';
import {validateBoardStorage} from './boardSchema.js';
import type * as Sqlite from '../sqlite.js';
import {configureWalletStorage} from '../wallet/integration.js';
import {configureCanonicalTaskBridge} from './adapter.js';
import {inspectProductivityStorage} from './inspection.js';
import {assertCurrentTaskTree} from './structureInvariant.js';
/** Invoked explicitly by runtime/offline recovery, never on module import. */
export async function configureTaskStorage(sqlite:typeof Sqlite,options:{validateCurrentTasks?:boolean}={}):Promise<void> {
 const connection=sqlite.sqliteConnection();
 const hasProductivity=inspectProductivityStorage({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)});
 if(options.validateCurrentTasks!==false&&hasProductivity)validateSeriesStorage({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)});
 if(options.validateCurrentTasks!==false)assertCurrentTaskTree({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)});
 if(options.validateCurrentTasks!==false&&hasProductivity&&(connection.prepare("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'").get()as any)?.version>=7)validateBoardStorage({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)});
 if(options.validateCurrentTasks!==false&&hasProductivity)validateBoardViewStorage({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)},(connection.prepare("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'").get()as any)?.version);
 const gateway=await import('../appStore.js');
 const migrations=await import('../appMigrations.js');
 const snapshot=await import('../appSnapshot.js');
 configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});
 const walletVersion=migrations.getDomainVersions().wallet;
 configureWalletStorage({migrations,snapshot,version:walletVersion===2?2:1});
 // Authenticated offline restoration validates replacement data in the shared
 // restore engine. Ordinary startup/capture always refuses malformed live DTOs.
 if(options.validateCurrentTasks!==false)sqlite.sqliteLoad();
}
