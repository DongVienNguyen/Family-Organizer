import {createHash} from 'node:crypto';
import type {AppWriteTx} from '../appStore.js';
/** Candidate schema only: intentionally absent from the migration/snapshot/runtime
 * registry until all-writer board invariants and recovery admission are wired. */
export const boardTables={
 productivity_boards:['id','list_id','mode','revision'],
 productivity_board_columns:['board_id','id','list_id','column_key','section_id','rank','wip_limit','wip_policy','archived_at','revision'],
 productivity_board_positions:['board_id','task_id','list_id','column_id','rank'],
}as const;
export const boardSchemaSql=`
CREATE TABLE productivity_boards(
 id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(id)) BETWEEN 1 AND 256),
 list_id TEXT NOT NULL REFERENCES productivity_lists(id),
 mode TEXT NOT NULL CHECK(mode IN('sections','workflow')),
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
 UNIQUE(list_id,mode),UNIQUE(id,list_id)
);
CREATE TABLE productivity_board_columns(
 board_id TEXT NOT NULL,id TEXT NOT NULL CHECK(length(trim(id)) BETWEEN 1 AND 256),list_id TEXT NOT NULL,
 column_key TEXT NOT NULL CHECK(length(trim(column_key)) BETWEEN 1 AND 264),section_id TEXT,
 rank INTEGER NOT NULL CHECK(typeof(rank)='integer' AND rank BETWEEN 0 AND 9007199254740991),
 wip_limit INTEGER,wip_policy TEXT NOT NULL CHECK(wip_policy IN('off','soft','hard')),archived_at TEXT,
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(board_id,id),UNIQUE(board_id,column_key),UNIQUE(board_id,id,list_id),
 FOREIGN KEY(board_id,list_id) REFERENCES productivity_boards(id,list_id),
 FOREIGN KEY(section_id,list_id) REFERENCES productivity_sections(id,list_id),
 CHECK((wip_policy='off' AND wip_limit IS NULL) OR (wip_policy IN('soft','hard') AND typeof(wip_limit)='integer' AND wip_limit BETWEEN 1 AND 9007199254740991))
);
CREATE UNIQUE INDEX productivity_tasks_board_identity ON productivity_tasks(id,list_id);
CREATE TABLE productivity_board_positions(
 board_id TEXT NOT NULL,task_id TEXT NOT NULL,list_id TEXT NOT NULL,column_id TEXT NOT NULL,
 rank INTEGER NOT NULL CHECK(typeof(rank)='integer' AND rank BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(board_id,task_id),
 FOREIGN KEY(board_id,column_id,list_id) REFERENCES productivity_board_columns(board_id,id,list_id),
 FOREIGN KEY(task_id,list_id) REFERENCES productivity_tasks(id,list_id) ON DELETE CASCADE
);
CREATE INDEX productivity_board_positions_lane ON productivity_board_positions(board_id,column_id,rank,task_id);
`;
export const productivityBoardCandidateChecksum=createHash('sha256').update(boardSchemaSql+'\nshared-list-board-columns-positions-candidate-v7').digest('hex');
export function prepareBoardSchema(tx:Pick<AppWriteTx,'exec'>):void {tx.exec(boardSchemaSql);}
type Reader=Pick<AppWriteTx,'get'|'all'>;
const normalize=(sql:string)=>sql.trim().replace(/;$/,'').replace(/\s+/g,' ');
/** Read only, comparing exact owned constraints and indexes. Never repairs DDL. */
export function inspectBoardSchema(reader:Reader):void {
 for(const statement of boardSchemaSql.trim().split(';').map(x=>x.trim()).filter(Boolean)){
  const match=/^CREATE (TABLE|(?:UNIQUE )?INDEX) (\w+)/.exec(statement)!;
  const type=match[1]==='TABLE'?'table':'index';
  if(normalize(reader.get('SELECT sql FROM sqlite_master WHERE type=? AND name=?',type,match[2])?.sql??'')!==normalize(statement))throw Error('Unsupported productivity board storage schema');
 }
}
/** Trusted full-store validation, not an ACL projection or WIP admission check.
 * Positions are ordering metadata: canonical Task fields determine membership.
 * Missing positions are allowed for lazy seeding; orphan/inconsistent ones refuse. */
export function validateBoardStorage(reader:Reader):void {
 inspectBoardSchema(reader);
 for(const table of Object.keys(boardTables))if(reader.all(`PRAGMA foreign_key_check(${table})`).length)throw Error('Invalid productivity board foreign key');
 if(reader.get(`SELECT 1 FROM productivity_board_columns c LEFT JOIN productivity_boards b ON b.id=c.board_id AND b.list_id=c.list_id
 LEFT JOIN productivity_sections s ON s.id=c.section_id AND s.list_id=c.list_id
 WHERE b.id IS NULL OR (c.section_id IS NOT NULL AND s.id IS NULL)
 OR (b.mode='sections' AND NOT((c.section_id IS NULL AND c.column_key='none') OR (c.section_id IS NOT NULL AND c.column_key='section:'||c.section_id)))
 OR (b.mode='workflow' AND (c.section_id IS NOT NULL OR c.column_key NOT IN('todo','doing','waiting','review','done','wont_do','trash'))) LIMIT 1`))throw Error('Invalid productivity board column');
 if(reader.get(`SELECT 1 FROM productivity_board_positions p
 LEFT JOIN productivity_boards b ON b.id=p.board_id AND b.list_id=p.list_id
 LEFT JOIN productivity_board_columns c ON c.board_id=p.board_id AND c.id=p.column_id AND c.list_id=p.list_id
 LEFT JOIN productivity_tasks t ON t.id=p.task_id AND t.list_id=p.list_id
 WHERE b.id IS NULL OR c.id IS NULL OR t.id IS NULL OR c.archived_at IS NOT NULL
 OR (b.mode='sections' AND NOT(t.section_id IS c.section_id))
 OR (b.mode='workflow' AND c.column_key!=CASE WHEN t.deleted_at IS NOT NULL THEN 'trash' WHEN t.lifecycle='wont_do' THEN 'wont_do' WHEN t.pending_approval=1 THEN 'review' WHEN t.lifecycle='completed' THEN 'done' WHEN t.blocked=1 THEN 'waiting' WHEN t.lifecycle='in_progress' THEN 'doing' ELSE 'todo' END) LIMIT 1`))throw Error('Invalid productivity board position');
}
