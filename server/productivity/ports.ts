import type * as Sqlite from '../sqlite.js';
import type * as Gateway from '../appStore.js';
import {createTaskAccess,type TaskReader} from './access.js';
import {createTaskCommands} from './tasks.js';
import {createStructureCommands} from './structure.js';
import {createStructureEventScope} from './structureEvents.js';
import type {ProductivityPorts} from './router.js';
/** Called by explicit runtime setup after the single storage owner is ready. */
export function createProductivityPorts(sqlite:typeof Sqlite,gateway:typeof Gateway):ProductivityPorts {
 const connection=sqlite.sqliteConnection(),reader:TaskReader={get:(sql:string,...args:any[])=>connection.prepare(sql).get(...args),all:(sql:string,...args:any[])=>connection.prepare(sql).all(...args)};
 return {active:()=>reader.get("SELECT value FROM app_meta WHERE key='productivity_active'")?.value==='1',structure:createStructureCommands({write:gateway.withAppWriteTransaction,reader}),structureEvents:createStructureEventScope(reader),access:createTaskAccess(reader),commands:createTaskCommands({write:gateway.withAppWriteTransaction,reader})};
}
