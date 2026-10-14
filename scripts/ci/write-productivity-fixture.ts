// CI-only synthetic seed builder; never included in the production ZIP.
import fs from 'node:fs';
import {UserRole} from '../../src/types.js';
import {tagOwnershipSchemaSql} from '../../server/productivity/tagSchema.js';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {legacyTask} from '../../tests/fixtures/productivity.js';
import {schemaSql,productivityTables} from '../../server/productivity/schema.js';
import {productivityTablesAt,productivitySchemaAt,structureSchemaSql} from '../../server/productivity/structureSchema.js';
const target=process.argv[2],commitSha=process.env.TEST_COMMIT_SHA;
if(!target||!commitSha||!/^[a-f0-9]{40}$/.test(commitSha))throw Error('Synthetic fixture identity required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'family-productivity-seed-'));process.env.DATA_DIR=path.join(root,'data');process.env.CONFIG_DIR=path.join(root,'config');process.env.LOG_DIR=path.join(root,'logs');process.env.NODE_ENV='test';
let sqlite:typeof import('../../server/sqlite.js')|undefined;
try{
 sqlite=await import('../../server/sqlite.js');const gateway=await import('../../server/appStore.js'),migrations=await import('../../server/appMigrations.js'),snapshot=await import('../../server/appSnapshot.js'),bridge=await import('../../server/productivity/adapter.js'),store=await import('../../server/productivity/store.js');
 const command=<T>(fn:(tx:import('../../server/appStore.js').AppWriteTx)=>T)=>gateway.withAppWriteTransaction({actorId:'system:synthetic',command:'productivity:ci-seed',requestId:randomUUID(),payloadHash:'synthetic'},fn);
 const source=['canonical-parent','canonical-task'].map(id=>legacyTask(id,{creatorId:'package-admin',assigneeId:'package-admin',rotationMemberIds:['package-admin']}));command(tx=>{tx.legacy.users=[{id:'package-admin',username:'synthetic-package-admin',fullName:'Synthetic package actor',role:UserRole.ADMIN,passwordHash:'synthetic-offline-not-runtime-credential',avatarColor:'blue',createdAt:'2026-10-10T00:00:00Z'}];tx.legacy.tasks=source;});
 bridge.configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});
 command(tx=>{const row=store.loadTask(tx,'canonical-task')!;tx.run('INSERT INTO productivity_sections(id,list_id,title) VALUES(?,?,?)','canonical-section',row.listId,'Synthetic section');store.savePilotTask(tx,{...row,parentId:'canonical-parent',sectionId:'canonical-section',rank:7777});tx.run('INSERT INTO productivity_matrix_pins(view_id,task_id,quadrant) VALUES(?,?,?)','synthetic-view',row.id,'q2');bridge.activateCanonicalTasks(tx,bridge.legacyTaskDigest(tx.legacy.tasks));});
 command(tx=>tx.run('INSERT INTO productivity_check_items VALUES(?,?,?,?,?)','canonical-check','canonical-task','Synthetic compiled checklist',1,1024));
 command(tx=>{tx.run('INSERT INTO productivity_tags VALUES(?,?)','canonical-owner-tag','Synthetic owned catalog tag');tx.run('INSERT INTO productivity_tag_owners VALUES(?,?)','canonical-owner-tag','package-admin');});
 const columns=productivityTablesAt(3);
 const value=command(tx=>({format:1,commitSha,schemaSql:productivitySchemaAt(3),v1SchemaSql:schemaSql,structureSchemaSql,tagOwnershipSchemaSql,version:3,columns,tables:Object.fromEntries(Object.keys(columns).map(name=>[name,tx.all(`SELECT * FROM ${name}`)])),migration:tx.get("SELECT * FROM app_migrations WHERE namespace='productivity' AND version=1"),migrations:tx.all("SELECT * FROM app_migrations WHERE namespace='productivity' ORDER BY version")}));
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(value,null,2)+'\n');
}finally{sqlite?.sqliteClose();fs.rmSync(root,{recursive:true,force:true});}
