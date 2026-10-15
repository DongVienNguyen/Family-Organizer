import {randomUUID} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
import {AppStoreError} from '../appErrors.js';
import {planBoardRank} from './rank.js';

const fail=(message:string):never=>{throw new AppStoreError(message,422,'board-layout');};
export function assertMutableCatalogRevision(revision:number):void {
 if(!Number.isSafeInteger(revision)||revision<1||revision>=Number.MAX_SAFE_INTEGER)fail('Phiên bản mục đã đạt giới hạn.');
}

/** Section writes and canonical board metadata share the caller's I01 transaction.
 * Candidate tables at schema6 are deliberately inactive; this never creates DDL. */
export function syncSectionBoard(tx:AppWriteTx,section:{id:string;listId:string;archivedAt:string|null}):void {
 if(![7,8].includes(tx.get("SELECT max(version)AS version FROM app_migrations WHERE namespace='productivity'")?.version))return;
 const board=tx.get("SELECT id,revision FROM productivity_boards WHERE list_id=? AND mode='sections'",section.listId);
 if(!board)return;
 assertMutableCatalogRevision(board.revision);
 const old=tx.get('SELECT * FROM productivity_board_columns WHERE board_id=? AND section_id=?',board.id,section.id);
 if(section.archivedAt!==null){
  if(old&&old.archived_at===null){
   assertMutableCatalogRevision(old.revision);
   if(tx.get('SELECT task_id FROM productivity_board_positions WHERE board_id=? AND column_id=? LIMIT 1',board.id,old.id))fail('Cột vẫn có vị trí công việc.');
   tx.run('UPDATE productivity_board_columns SET archived_at=?,revision=revision+1 WHERE board_id=? AND id=?',section.archivedAt,board.id,old.id);
  }
 }else if(old){
  if(old.archived_at!==null)fail('Cột section đã được lưu trữ.');
  assertMutableCatalogRevision(old.revision);
  tx.run('UPDATE productivity_board_columns SET revision=revision+1 WHERE board_id=? AND id=?',board.id,old.id);
 }else{
  const current=tx.all('SELECT id,rank,revision FROM productivity_board_columns WHERE board_id=? AND archived_at IS NULL ORDER BY rank,id LIMIT 1001',board.id);
  if(current.length>=1000)fail('Bảng đã đạt giới hạn1000 cột.');
  const id=randomUUID(),plan=planBoardRank({positions:current.map(c=>({taskId:c.id,rank:c.rank})),taskId:id,beforeTaskId:null});
  for(const p of plan.rebalance){
   if(p.taskId===id)continue;
   const c=current.find(c=>c.id===p.taskId)!;
   if(c.rank===p.rank)continue;
   assertMutableCatalogRevision(c.revision);
   tx.run('UPDATE productivity_board_columns SET rank=?,revision=revision+1 WHERE board_id=? AND id=?',p.rank,board.id,c.id);
  }
  tx.run('INSERT INTO productivity_board_columns VALUES(?,?,?,?,?,?,?,?,?,?)',board.id,id,section.listId,'section:'+section.id,section.id,plan.rank,null,'off',null,1);
 }
 tx.run('UPDATE productivity_boards SET revision=revision+1 WHERE id=?',board.id);
}
