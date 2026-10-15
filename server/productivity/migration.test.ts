import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withAppWriteTransaction} from '../appStore.js';
import {sqliteConnection,sqliteLoad} from '../sqlite.js';
import {applyDomainMigrations,getDomainVersions,registerDomainMigration} from '../appMigrations.js';
import {registerSnapshotTable,registerSnapshotValidator} from '../appSnapshot.js';
import {migrateTasks,registerProductivityMigration} from './migrate.js';
import {loadTask,toLegacyTask} from './store.js';
import {legacyTask} from '../../tests/fixtures/productivity.js';
import {TaskStatus} from '../../src/types.js';
const command=<T>(fn:Parameters<typeof withAppWriteTransaction<T>>[1])=>withAppWriteTransaction({actorId:'system:test',command:'productivity:pilot-fixture',requestId:randomUUID(),payloadHash:'synthetic'},fn);
it('migrates twice without duplicating IDs/tags/lists; keeps all legacy metadata and does not activate a second writer',()=>{
 const old=[legacyTask('keep',{pendingApproval:true,submittedById:'child',submittedAt:'2026-10-10T01:00:00Z',recurrenceType:'weekly',recurrenceInterval:2})];
 command(tx=>{tx.legacy.tasks=structuredClone(old);const first=migrateTasks(tx,old);expect(first.inserted).toBe(1);expect(first.warnings[0].rawDue).toBe(old[0].dueDate);const second=migrateTasks(tx,old);expect(second.inserted).toBe(0);expect(second.existing).toBe(1);
  const row=loadTask(tx,'keep')!;expect(row.due).toEqual({kind:'timed',instantUtc:'2026-10-11T02:30:00.000Z',timezone:'Asia/Saigon'});expect(toLegacyTask(row)).toEqual(old[0]);
  expect(tx.get('SELECT count(*) AS n FROM productivity_lists').n).toBe(1);expect(tx.get('SELECT count(*) AS n FROM productivity_tags').n).toBe(1);expect(tx.get('SELECT count(*) AS n FROM productivity_task_tags').n).toBe(1);
 });expect(sqliteLoad().tasks).toEqual(old);expect(sqliteConnection().prepare("SELECT value FROM app_meta WHERE key='productivity_active'").get()).toBeUndefined();
});
it('overdue without evidence maps todo with warning, explicit latest history keeps doing, and raw invalid due remains in report',()=>{
 command(tx=>{const rows=[legacyTask('unknown',{status:TaskStatus.OVERDUE,dueDate:'01/02'}),legacyTask('doing',{status:TaskStatus.OVERDUE,history:[{id:'h',userId:'adult',username:'synthetic',action:"Cập nhật: trạng thái từ 'todo' thành 'in_progress'",createdAt:'2026-10-10T00:00:00Z'}]})];const report=migrateTasks(tx,rows);expect(loadTask(tx,'unknown')!.lifecycle).toBe('todo');expect(loadTask(tx,'doing')!.lifecycle).toBe('in_progress');const unknown=report.warnings.find(x=>x.taskId==='unknown')!;expect(unknown.rawDue).toBe('01/02');expect(unknown.warnings.join(' ')).toMatch(/overdue/i);expect(unknown.warnings.join(' ')).toContain('01/02');});
});
it('rolls back schema and rows on a malformed row instead of leaving a partial migration',()=>{
 const before=sqliteConnection().prepare('SELECT count(*) AS n FROM sqlite_master').get();
 expect(()=>command(tx=>migrateTasks(tx,[legacyTask('atomic-good'),legacyTask('atomic-bad',{title:''})]))).toThrow();
 expect(sqliteConnection().prepare('SELECT count(*) AS n FROM sqlite_master').get()).toEqual(before);
 command(tx=>{expect(loadTask(tx,'atomic-good')).toBeNull();expect(loadTask(tx,'atomic-bad')).toBeNull();});
});
it('uses I01 checksum/order/pilot migration registry and refuses nonpilot changes',()=>{
 registerProductivityMigration({registerMigration:registerDomainMigration,registerSnapshot:registerSnapshotTable,registerValidator:registerSnapshotValidator});expect(()=>applyDomainMigrations({enabled:['productivity'],pilot:false})).toThrow(/pilot/i);
 applyDomainMigrations({enabled:['productivity'],pilot:true});applyDomainMigrations({enabled:['productivity'],pilot:true});expect(getDomainVersions().productivity).toBe(5);
 sqliteConnection().prepare("UPDATE app_migrations SET checksum='corrupt' WHERE namespace='productivity'").run();
 expect(()=>applyDomainMigrations({enabled:['productivity'],pilot:true})).toThrow(/checksum/i);
});
it('does not treat a quoted status phrase inside assignment text as workflow proof',()=>{
 command(tx=>{migrateTasks(tx,[legacyTask('quoted',{status:TaskStatus.OVERDUE,history:[{id:'new',userId:'adult',username:'synthetic',action:"Đã thay đổi: giao việc cho trạng thái từ 'todo' thành 'in_progress'",createdAt:'2026-10-11T00:00:00Z'},{id:'old',userId:'adult',username:'synthetic',action:"Đã thay đổi: trạng thái từ 'in_progress' thành 'todo'",createdAt:'2026-10-10T00:00:00Z'}]})]);expect(loadTask(tx,'quoted')!.lifecycle).toBe('todo');});
});
it.each([{tags:'home'},{comments:42},{history:'bad-history'},{createdAt:0},{proofImage:17}])('rejects malformed provenance before normalization %#',patch=>{
 const id='malformed-'+randomUUID();expect(()=>command(tx=>migrateTasks(tx,[legacyTask(id,patch as any)]))).toThrow();
 command(tx=>{expect(loadTask(tx,id)).toBeNull();});
});
