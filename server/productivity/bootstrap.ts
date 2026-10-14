import type * as Sqlite from '../sqlite.js';
import {configureCanonicalTaskBridge} from './adapter.js';
import {inspectProductivityStorage} from './inspection.js';
/** Invoked explicitly by runtime/offline recovery, never on module import. */
export async function configureTaskStorage(sqlite:typeof Sqlite):Promise<void> {
 const connection=sqlite.sqliteConnection();
 inspectProductivityStorage({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)});
 const gateway=await import('../appStore.js');
 const migrations=await import('../appMigrations.js');
 const snapshot=await import('../appSnapshot.js');
 configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});
 sqlite.sqliteLoad(); // Validate active DTOs/identity before exposing any legacy read.
}
