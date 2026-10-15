import {createCompletionCommands} from './completion.js';
import {createProductivityClock} from './clock.js';
import {createBoardLayout} from './boardLayout.js';
import {createBoardMoves} from './boardMoves.js';
import {createBoardProjection} from './boardProjection.js';
import {createBoardCatalog} from './boardCatalog.js';
import {createMatrixCommands} from './matrix.js';
import type {SelectionBudget} from './query.js';
import {createTaskQueryHttp} from './queryHttp.js';
import {createTaskViews} from './views.js';
import {createTaskPins} from './pins.js';
import type * as Sqlite from '../sqlite.js';
import type * as Gateway from '../appStore.js';
import {createTaskAccess,type TaskReader} from './access.js';
import {createTaskCommands} from './tasks.js';
import {createStructureCommands} from './structure.js';
import {createStructureEventScope} from './structureEvents.js';
import type {ProductivityPorts} from './router.js';
/** Called by explicit runtime setup after the single storage owner is ready. */
export function createProductivityPorts(sqlite:typeof Sqlite,gateway:typeof Gateway,options:{legacyCompletion?:Parameters<typeof createCompletionCommands>[0]['legacy'];queryNow?:()=>number;queryPageSize?:number;querySelectionBudget?:SelectionBudget;matrixPreviewLimit?:number}={}):ProductivityPorts {
 const connection=sqlite.sqliteConnection(),reader:TaskReader={get:(sql:string,...args:any[])=>connection.prepare(sql).get(...args),all:(sql:string,...args:any[])=>connection.prepare(sql).all(...args)};
 const views=createTaskViews({reader,write:gateway.withAppWriteTransaction}),clockNow=options.queryNow??createProductivityClock(reader);
 return {completion:options.legacyCompletion?createCompletionCommands({reader,write:gateway.withAppWriteTransaction,legacy:options.legacyCompletion}):undefined,boardLayout:createBoardLayout({reader,views,write:gateway.withAppWriteTransaction,now:clockNow}),boardMoves:createBoardMoves({reader,views,write:gateway.withAppWriteTransaction,now:clockNow}),boardProjection:createBoardProjection({reader,views,now:clockNow}),boards:createBoardCatalog({reader,write:gateway.withAppWriteTransaction}),matrix:createMatrixCommands({reader,write:gateway.withAppWriteTransaction,now:clockNow,previewLimit:options.matrixPreviewLimit}),query:createTaskQueryHttp({reader,now:clockNow,pageSize:options.queryPageSize,selectionBudget:options.querySelectionBudget}),views,pins:createTaskPins({write:gateway.withAppWriteTransaction,reader}),active:()=>reader.get("SELECT value FROM app_meta WHERE key='productivity_active'")?.value==='1',structure:createStructureCommands({write:gateway.withAppWriteTransaction,reader}),structureEvents:createStructureEventScope(reader),access:createTaskAccess(reader),commands:createTaskCommands({write:gateway.withAppWriteTransaction,reader})};
}
