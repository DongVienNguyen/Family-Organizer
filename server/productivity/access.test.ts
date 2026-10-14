import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withAppWriteTransaction} from '../appStore.js';
import {sqliteConnection} from '../sqlite.js';
import {migrateTasks} from './migrate.js';
import {loadTask,savePilotTask} from './store.js';
import {createTaskAccess,canReadTask} from './access.js';
import {legacyTask} from '../../tests/fixtures/productivity.js';
import {UserRole} from '../../src/types.js';
const actor=(role:UserRole)=>({userId:role,role});
const command=<T>(fn:Parameters<typeof withAppWriteTransaction<T>>[1])=>withAppWriteTransaction({actorId:'system:test',command:'productivity:access-fixture',requestId:randomUUID(),payloadHash:'synthetic'},fn);
const connection=sqliteConnection();
const access=createTaskAccess({get:(sql,...args)=>connection.prepare(sql).get(...args),all:(sql,...args)=>connection.prepare(sql).all(...args)});
function seed(id:string,shared=false,creator:string=UserRole.ADMIN,assignee:string|null=null){
 command(tx=>{migrateTasks(tx,[legacyTask(id,{creatorId:creator,assigneeId:assignee,isShared:shared})]);});
}
it.each([UserRole.CHILD,UserRole.GUEST,UserRole.MEMBER])('hides another actor private task from direct lookup: %s',role=>{
 const id='private-'+role;seed(id);expect(access.getTask(actor(role),id)).toBeNull();expect(()=>access.assertTaskCommand(actor(role),id,'update')).toThrow(expect.objectContaining({status:404}));
});
it.each([UserRole.CHILD,UserRole.GUEST,UserRole.MEMBER])('shared visibility is read, not implicit write: %s',role=>{
 const id='shared-'+role;seed(id,true);expect(access.getTask(actor(role),id)?.id).toBe(id);expect(()=>access.assertTaskCommand(actor(role),id,'update')).toThrow(expect.objectContaining({status:403}));
});
it('allows own/assigned child edits and admin management but rejects unknown roles/deleted tasks',()=>{
 seed('assigned',false,UserRole.ADMIN,UserRole.CHILD);const row=command(tx=>loadTask(tx,'assigned')!);
 expect(canReadTask(actor(UserRole.CHILD),row)).toBe(true);expect(canReadTask({userId:'bad',role:'forged' as any},row)).toBe(false);
 expect(access.assertTaskCommand(actor(UserRole.CHILD),'assigned','update').id).toBe('assigned');
 expect(access.assertTaskCommand(actor(UserRole.ADMIN),'assigned','update').id).toBe('assigned');
 command(tx=>savePilotTask(tx,{...row,deletedAt:'2026-10-14T00:00:00Z'}));expect(access.getTask(actor(UserRole.ADMIN),'assigned')).toBeNull();
});
it('list read grant permits private read without write; write grant and owner permit member writes',()=>{
 seed('grant');command(tx=>tx.run('INSERT INTO productivity_list_grants VALUES(?,?,?)','legacy-family',UserRole.MEMBER,'read'));
 expect(access.getTask(actor(UserRole.MEMBER),'grant')?.id).toBe('grant');expect(()=>access.assertTaskCommand(actor(UserRole.MEMBER),'grant','update')).toThrow(expect.objectContaining({status:403}));
 command(tx=>tx.run("UPDATE productivity_list_grants SET permission='write' WHERE user_id=?",UserRole.MEMBER));
 expect(access.assertTaskCommand(actor(UserRole.MEMBER),'grant','update').id).toBe('grant');
 command(tx=>{tx.run('DELETE FROM productivity_list_grants');tx.run('UPDATE productivity_lists SET owner_id=? WHERE id=?',UserRole.MEMBER,'legacy-family');});
 expect(access.assertTaskCommand(actor(UserRole.MEMBER),'grant','update').id).toBe('grant');
});
it('filters hidden rows before decoding their private content, including list/count and malformed JSON',()=>{
 seed('hidden-corrupt');seed('visible-safe',true);
 command(tx=>tx.run("UPDATE productivity_tasks SET legacy_json='not-json' WHERE id='hidden-corrupt'"));
 expect(access.getTask(actor(UserRole.GUEST),'hidden-corrupt')).toBeNull();
 const rows=access.listTasks(actor(UserRole.GUEST));expect(rows.map(t=>t.id)).toContain('visible-safe');expect(rows.some(t=>t.id==='hidden-corrupt')).toBe(false);
 connection.prepare('UPDATE productivity_tasks SET legacy_json=? WHERE id=?').run(JSON.stringify(legacyTask('hidden-corrupt',{creatorId:UserRole.ADMIN,assigneeId:null,isShared:false})),'hidden-corrupt');
});
