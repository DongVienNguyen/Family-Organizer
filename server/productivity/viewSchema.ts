import type {AppWriteTx} from '../appStore.js';
import {normalizeTaskSearchText} from '../../src/features/productivity/filters.js';
export const viewTables={
 productivity_views:['id','owner_id','title','revision','filter_json','kind','config_json'],
 productivity_search_documents:['task_id','content'],
 productivity_search_grams:['task_id','gram'],
} as const;
export const viewSchemaSql=`
CREATE TABLE productivity_views(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,title TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),filter_json TEXT NOT NULL CHECK(json_valid(filter_json)),kind TEXT NOT NULL CHECK(kind IN('list','matrix','kanban','calendar','timeline')),config_json TEXT NOT NULL CHECK(json_valid(config_json)));
CREATE INDEX productivity_views_owner ON productivity_views(owner_id,id);
CREATE TABLE productivity_search_documents(task_id TEXT PRIMARY KEY REFERENCES productivity_tasks(id) ON DELETE CASCADE,content TEXT NOT NULL);
CREATE TABLE productivity_search_grams(task_id TEXT NOT NULL REFERENCES productivity_search_documents(task_id) ON DELETE CASCADE,gram TEXT NOT NULL,PRIMARY KEY(task_id,gram));
CREATE INDEX productivity_search_grams_lookup ON productivity_search_grams(gram,task_id);
`;
export const searchGrams=(content:string)=>{const chars=Array.from(content);return [...new Set(Array.from({length:Math.max(0,chars.length-2)},(_,i)=>chars.slice(i,i+3).join('')))].sort();};
export const taskSearchContent=(task:{title:string;body:string})=>normalizeTaskSearchText(task.title+'\n'+task.body);
export function writeSearchDocument(tx:AppWriteTx,task:{id:string;title:string;body:string}):void {
 if(!tx.get("SELECT name FROM sqlite_master WHERE type='table' AND name='productivity_search_documents'"))return;
 const content=taskSearchContent(task),prior=tx.get('SELECT content FROM productivity_search_documents WHERE task_id=?',task.id);
 if(prior?.content===content)return;
 tx.run('INSERT INTO productivity_search_documents VALUES(?,?) ON CONFLICT(task_id) DO UPDATE SET content=excluded.content',task.id,content);
 tx.run('DELETE FROM productivity_search_grams WHERE task_id=?',task.id);
 for(const gram of searchGrams(content))tx.run('INSERT INTO productivity_search_grams VALUES(?,?)',task.id,gram);
}
export function migrateViewsAndSearch(tx:AppWriteTx):void {
 tx.exec(viewSchemaSql);
 for(const row of tx.all('SELECT id,title,body FROM productivity_tasks'))writeSearchDocument(tx,row);
}
