import type {AppWriteTx} from '../appStore.js';
export const tagOwnershipTables={productivity_tag_owners:['tag_id','user_id']}as const;
export const tagOwnershipSchemaSql=`CREATE TABLE productivity_tag_owners(
 tag_id TEXT PRIMARY KEY REFERENCES productivity_tags(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL
);
CREATE INDEX productivity_tag_owners_user ON productivity_tag_owners(user_id,tag_id);
`;
/** Infer only recorded creation revision1; unknown legacy ownership stays unknown. */
export function migrateTagOwnership(tx:AppWriteTx):void {
 tx.exec(tagOwnershipSchemaSql);
 const users=new Set(tx.legacy.users.map(user=>user.id));
 for(const row of tx.all("SELECT actor_id,result FROM app_commands WHERE command='productivity:structure:tag' ORDER BY committed_at,request_id")){
  let value:any;try{value=JSON.parse(row.result)?.value;}catch{continue;}
  if(value?.revision!==1||typeof value.id!=='string'||!users.has(row.actor_id)||!tx.get('SELECT id FROM productivity_tags WHERE id=?',value.id))continue;
  tx.run('INSERT OR IGNORE INTO productivity_tag_owners VALUES(?,?)',value.id,row.actor_id);
 }
}
