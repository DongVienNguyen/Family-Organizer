import Database from 'better-sqlite3';
import {it,expect} from 'vitest';
import {schemaSql} from './schema.js';
import {structureSchemaSql} from './structureSchema.js';
import {inspectProductivityStorage} from './inspection.js';
const frozenV1='8f978329c9628a1c54b25a456a34c46d74c868397f78b9592ef2c026e95a9f90';
const ports=(db:Database.Database)=>({get:(sql:string,...args:any[])=>db.prepare(sql).get(...args),all:(sql:string,...args:any[])=>db.prepare(sql).all(...args)});
it('supported historical v1 storage is inspected without an implicit structure upgrade',()=>{
 const db=new Database(':memory:');try{db.exec("CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE app_migrations(namespace TEXT,version INTEGER,checksum TEXT,applied_at TEXT);"+schemaSql);db.prepare('INSERT INTO app_migrations VALUES(?,?,?,?)').run('productivity',1,frozenV1,'2026-10-11T00:00:00Z');db.prepare('INSERT INTO app_meta VALUES(?,?)').run('productivity_active','1');
 const before=db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all();expect(inspectProductivityStorage(ports(db))).toBe(true);expect(db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all()).toEqual(before);expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN('productivity_catalog_revisions','productivity_check_items')").get()).toEqual({n:0});}finally{db.close();}
});
it('orphan structure tables without migration records fail closed instead of being treated as a fresh installation',()=>{
 const db=new Database(':memory:');try{db.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE productivity_tasks(id TEXT PRIMARY KEY,parent_id TEXT,deleted_at TEXT);'+structureSchemaSql);const before=db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all();
 expect(()=>inspectProductivityStorage(ports(db))).toThrow(/Unsupported productivity migration/);expect(db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all()).toEqual(before);}finally{db.close();}
});
