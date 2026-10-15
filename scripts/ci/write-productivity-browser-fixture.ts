import fs from 'node:fs';
import path from 'node:path';
import {pbkdf2Sync,randomUUID} from 'node:crypto';
import {legacyTask} from '../../tests/fixtures/productivity.js';
const [data,config]=process.argv.slice(2);if(!data||!config)throw Error('Synthetic data/config roots required');
process.env.DATA_DIR=data;process.env.CONFIG_DIR=config;process.env.APP_CODE_ROOT=process.cwd();fs.mkdirSync(data,{recursive:true});fs.mkdirSync(config,{recursive:true});
const salt='00112233445566778899aabbccddeeff',passwordHash=`${salt}$${pbkdf2Sync('synthetic-browser-password',salt,120000,64,'sha512').toString('hex')}`;
const users=['admin','member','child','guest'].map(role=>({id:'browser-'+role,username:'browser-'+role,fullName:'Synthetic '+role,role,passwordHash,avatarColor:'bg-sky-500',createdAt:'2026-10-14T00:00:00Z'}));
const tasks=['chromium','firefox','webkit'].flatMap(engine=>[
 legacyTask('ui-root-'+engine,{title:'Synthetic UI root '+engine,creatorId:'browser-admin',assigneeId:null,isShared:true,dueDate:'',rewardPoints:0,rotationMemberIds:[],sourceRecurringTaskId:null,proofImage:undefined,proofNote:'Synthetic retained proof',comments:[{id:'ui-comment-'+engine,userId:'browser-admin',username:'browser-admin',content:'Synthetic retained comment',createdAt:'2026-10-14T00:00:00Z'}]}),
 legacyTask('ui-child-'+engine,{title:'Synthetic UI child '+engine,creatorId:'browser-child',assigneeId:'browser-child',isShared:true,dueDate:'',rewardPoints:35,rotationMemberIds:[],sourceRecurringTaskId:null,proofImage:undefined}),
 legacyTask('ui-private-'+engine,{title:'Synthetic UI private member '+engine,creatorId:'browser-member',assigneeId:null,isShared:false,dueDate:'',rewardPoints:0,rotationMemberIds:[],sourceRecurringTaskId:null,proofImage:undefined}),
]);
fs.writeFileSync(path.join(data,'db.json'),JSON.stringify({users,tasks}));fs.writeFileSync(path.join(config,'app_settings.json'),'{}');
const sqlite=await import('../../server/sqlite.js'),gateway=await import('../../server/appStore.js'),migrations=await import('../../server/appMigrations.js'),snapshot=await import('../../server/appSnapshot.js');
const {configureCanonicalTaskBridge,activateCanonicalTasks,legacyTaskDigest}=await import('../../server/productivity/adapter.js');
const fixture=<T>(fn:Parameters<typeof gateway.withAppWriteTransaction<T>>[1])=>gateway.withAppWriteTransaction({actorId:'system:test',command:'synthetic:productivity-browser',requestId:randomUUID(),payloadHash:'synthetic'},fn);
fixture(tx=>{tx.legacy.users=users as any;tx.legacy.tasks=tasks;});configureCanonicalTaskBridge({sqlite,gateway,migrations,snapshot});migrations.applyDomainMigrations({enabled:['productivity'],pilot:true});fixture(tx=>activateCanonicalTasks(tx,legacyTaskDigest(tx.legacy.tasks)));
const {createTaskCommands}=await import('../../server/productivity/tasks.js'),reader={get:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).get(...args),all:(sql:string,...args:any[])=>sqlite.sqliteConnection().prepare(sql).all(...args)},commands=createTaskCommands({reader,write:gateway.withAppWriteTransaction});
for(const task of tasks)commands.updateTask({actor:{userId:'browser-admin',role:'admin'},requestId:randomUUID(),expectedRevision:1},task.id,{priority:'none',due:{kind:'none'}});
const {createStructureCommands}=await import('../../server/productivity/structure.js'),structure=createStructureCommands({reader,write:gateway.withAppWriteTransaction});for(const engine of ['chromium','firefox','webkit'])structure.setChecklist({actor:{userId:'browser-admin',role:'admin'},requestId:randomUUID(),expectedRevision:2},'ui-root-'+engine,[{text:'Synthetic existing checklist '+engine,done:false}]);
if((reader.get("SELECT max(version) AS version FROM app_migrations WHERE namespace='productivity'") as {version:number}).version!==5)throw Error('Current synthetic schema5 required');sqlite.sqliteClose();
console.log(JSON.stringify({synthetic:true,productivityVersion:5,users:4,tasks:tasks.length,nativeHandlesClosed:true}));
