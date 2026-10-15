import type {AppSnapshot} from '../snapshotValidation.js';
import {text,integer,choice} from '../../src/features/productivity/validation.js';
import {utcInstant} from '../../src/features/productivity/dates.js';
import {decodeTaskRow} from './store.js';
import {workflowColumn} from './board.js';
/** Pure trusted-image validation: no SQLite connection/DDL, ACL or effects. */
export function validateBoardSnapshot(snapshot:AppSnapshot):void {
 if(snapshot.manifest.domains.productivity<7)return;
 const fail=():never=>{throw Error('Invalid productivity board snapshot');};
 const tables=snapshot.tables,boards=tables.productivity_boards,columns=tables.productivity_board_columns,positions=tables.productivity_board_positions;
 if(!boards||!columns||!positions)fail();
 const lists=new Set(tables.productivity_lists.map(row=>row.id)),sections=new Map(tables.productivity_sections.map(row=>[row.id,row])),tasks=new Map(tables.productivity_tasks.map(row=>[row.id,row]));
 const scopes=new Set<string>(),boardIds=new Map<string,any>(),columnIds=new Map<string,any>(),columnKeys=new Set<string>(),taskPositions=new Set<string>();
 const key=(...parts:string[])=>JSON.stringify(parts);
 for(const b of boards){text(b.id,256);text(b.list_id,256);choice(b.mode,['sections','workflow']);integer(b.revision,1);const scope=key(b.list_id,b.mode);if(!lists.has(b.list_id)||scopes.has(scope)||boardIds.has(b.id))fail();scopes.add(scope);boardIds.set(b.id,b);}
 for(const c of columns){
  text(c.board_id,256);text(c.id,256);text(c.list_id,256);text(c.column_key,264);integer(c.rank);integer(c.revision,1);choice(c.wip_policy,['off','soft','hard']);
  if(c.wip_policy==='off'){if(c.wip_limit!==null)fail();}else integer(c.wip_limit,1);
  if(c.archived_at!==null)utcInstant(c.archived_at);
  const b=boardIds.get(c.board_id),identity=key(c.board_id,c.id),scope=key(c.board_id,c.column_key);if(!b||b.list_id!==c.list_id||columnIds.has(identity)||columnKeys.has(scope))fail();
  if(b.mode==='sections'){
   if(c.section_id===null){if(c.column_key!=='none')fail();}
   else {text(c.section_id,256);if(sections.get(c.section_id)?.list_id!==c.list_id||c.column_key!=='section:'+c.section_id)fail();}
  }else if(c.section_id!==null||!['todo','doing','waiting','review','done','wont_do','trash'].includes(c.column_key))fail();
  columnIds.set(identity,c);columnKeys.add(scope);
 }
 for(const p of positions){
  text(p.board_id,256);text(p.task_id,256);text(p.list_id,256);text(p.column_id,256);integer(p.rank);
  const c=columnIds.get(key(p.board_id,p.column_id)),b=boardIds.get(p.board_id),t=tasks.get(p.task_id),identity=key(p.board_id,p.task_id);
  if(!b||!c||!t||c.archived_at!==null||b.list_id!==p.list_id||c.list_id!==p.list_id||t.list_id!==p.list_id||taskPositions.has(identity))fail();
  if(b.mode==='sections'?t.section_id!==c.section_id:workflowColumn(decodeTaskRow(t,[]))!==c.column_key)fail();
  taskPositions.add(identity);
 }
}
