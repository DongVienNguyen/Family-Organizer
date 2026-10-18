import {validateInsightStorage} from './insightRecord.js';
import {validateTrackingReminderStorage} from './trackingReminderRecord.js';
import {validateHabitStorage} from './habitRecord.js';
import {validateFocusStorage} from './focusRecord.js';
import {validateTaskImportStorage} from './importRecord.js';
import {validateTaskAttachmentStorage} from './taskAttachmentRecord.js';
import {validateTaskContentStorage} from './contentRecord.js';
import {validateTaskTemplateStorage} from './templateRecord.js';
import {validateTaskNotificationStorage} from './notificationRecord.js';
import {configureWalletSql} from '../wallet/sqlFunctions.js';
import type {WalletStorageVersion} from '../wallet/schemaRegistry.js';
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
 if(options.validateCurrentTasks!==false&&hasProductivity)validateTaskNotificationStorage({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)});
 if(options.validateCurrentTasks!==false&&hasProductivity)validateTaskTemplateStorage({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)});
 if(options.validateCurrentTasks!==false&&hasProductivity)validateTaskContentStorage({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)});
 if(options.validateCurrentTasks!==false&&hasProductivity)validateTaskAttachmentStorage({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)});
 if(options.validateCurrentTasks!==false&&hasProductivity)validateTaskImportStorage({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)});
 if(options.validateCurrentTasks!==false&&hasProductivity)validateFocusStorage({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)});
 if(options.validateCurrentTasks!==false&&hasProductivity)validateHabitStorage({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)});
 if(options.validateCurrentTasks!==false&&hasProductivity)validateTrackingReminderStorage({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)});
 if(options.validateCurrentTasks!==false&&hasProductivity)validateInsightStorage({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)});
 const gateway=await import('../appStore.js');
 const migrations=await import('../appMigrations.js');
 const snapshot=await import('../appSnapshot.js');
 configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});
 const walletVersion=migrations.getDomainVersions().wallet;
 configureWalletStorage({migrations,snapshot,version:(walletVersion||1) as WalletStorageVersion});
 configureWalletSql(connection);
 // Authenticated offline restoration validates replacement data in the shared
 // restore engine. Ordinary startup/capture always refuses malformed live DTOs.
 if(options.validateCurrentTasks!==false)sqlite.sqliteLoad();
}
