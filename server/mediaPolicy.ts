import {fromMarkdown} from 'mdast-util-from-markdown';
import {gfmFromMarkdown} from 'mdast-util-gfm';
import {gfm} from 'micromark-extension-gfm';
import type {FamilyOrganizerDB} from '../src/types.js';
import {UserRole} from '../src/types.js';
import type {AppWriteTx} from './appStore.js';
import {AppStoreError} from './appErrors.js';
import {validMediaPath} from './snapshotFiles.js';
import {canViewLegacyTask,canViewLegacyNote,canViewLegacyDocument,isAdult,type LegacyActor} from './legacyVisibility.js';
export interface MediaBinding {domain:'users'|'tasks'|'notes'|'documents'|'transactions'|'assets'|'debts';id:string}
export interface MediaMetadata {version:1;ownerId:string|null;createdAt:number;bindings:MediaBinding[]}
export const mediaKey=(url:string)=>'media:'+url;
export function mediaPath(url:string):string {
 if(!url.startsWith('/uploads/')||/[?#]/.test(url)||/%(?:2f|5c|25)/i.test(url))throw new Error('Invalid managed media URL');
 const value=decodeURIComponent(url.slice(9));validMediaPath(value);
 if(value.normalize('NFC')!==value||/[?#]/.test(value))throw new Error('Invalid managed media normalization');return value;
}
export const canonicalMediaUrl=(url:string)=>'/uploads/'+mediaPath(url);
const domains=['users','tasks','notes','documents','transactions','assets','debts'] as const;
export function parseMediaMetadata(value:string):MediaMetadata {
 if(value.length>128*1024)throw new Error('Media metadata limit');const row=JSON.parse(value);
 if(!row||JSON.stringify(Object.keys(row).sort())!==JSON.stringify(['version','ownerId','createdAt','bindings'].sort())||row.version!==1||!(row.ownerId===null||typeof row.ownerId==='string'&&row.ownerId.length>0&&row.ownerId.length<=256)||!Number.isSafeInteger(row.createdAt)||row.createdAt<0||!Array.isArray(row.bindings)||row.bindings.length>1000||row.bindings.some((b:any)=>!b||Object.keys(b).sort().join(',')!=='domain,id'||!domains.includes(b.domain)||typeof b.id!=='string'||!b.id||b.id.length>256)||new Set(row.bindings.map((b:any)=>JSON.stringify(b))).size!==row.bindings.length)throw new Error('Invalid media metadata');
 if(!row.bindings.length&&!row.ownerId)throw new Error('Unowned media staging');return row;
}
function markdownDestinations(content:string):string[] {
 const tree=fromMarkdown(content,{extensions:[gfm()],mdastExtensions:[gfmFromMarkdown()]}),definitions=new Map<string,string>(),urls:string[]=[];
 const walk=(node:any,visit:(node:any)=>void)=>{visit(node);for(const child of node.children??[])walk(child,visit);};
 walk(tree,node=>{if(node.type==='definition'&&!definitions.has(node.identifier))definitions.set(node.identifier,node.url);});
 walk(tree,node=>{
  if(node.type==='link'||node.type==='image')urls.push(node.url);
  else if(node.type==='linkReference'||node.type==='imageReference'){const url=definitions.get(node.identifier);if(url)urls.push(url);}
 });return urls;
}
/** Exact rendered managed destinations, shared by authorization and cleanup. */
export function managedMarkdownUrls(content:string):string[] {
 const urls=new Set<string>();
 for(const value of markdownDestinations(content))if(value.startsWith('/uploads/')){try{urls.add(canonicalMediaUrl(value));}catch{}}
 return [...urls];
}
export function mediaReferences(legacy:FamilyOrganizerDB):Map<string,MediaBinding[]> {
 const refs=new Map<string,MediaBinding[]>();
 const add=(value:unknown,domain:MediaBinding['domain'],id:string)=>{
  if(typeof value!=='string'||!value.startsWith('/uploads/'))return;let url:string;try{url=canonicalMediaUrl(value);}catch{return;}
  const bindings=refs.get(url)??[];if(!bindings.some(b=>b.domain===domain&&b.id===id))bindings.push({domain,id});refs.set(url,bindings);
 };
 for(const row of legacy.users??[])add(row.avatarImage,'users',row.id);
 for(const row of legacy.tasks??[])add(row.proofImage,'tasks',row.id);
 for(const row of legacy.notes??[])for(const url of managedMarkdownUrls(String(row.content??'')))add(url,'notes',row.id);
 for(const row of legacy.documents??[])for(const file of row.files??[])add(file.url,'documents',row.id);
 for(const row of legacy.transactions??[])add(row.receiptImage,'transactions',row.id);
 for(const row of legacy.assets??[])for(const photo of row.photos??[]){add(photo.thumbnailDataUrl,'assets',row.id);add(photo.fullDataUrl,'assets',row.id);}
 for(const row of legacy.debts??[])for(const url of row.attachments??[])add(url,'debts',row.id);
 return refs;
}
export function mayReadMedia(url:string,metadata:MediaMetadata|undefined,legacy:FamilyOrganizerDB,actor:LegacyActor,now=Date.now()):boolean {
 if(!Object.values(UserRole).includes(actor.role)||!metadata)return false;
 if(!metadata.bindings.length)return metadata.ownerId===actor.userId&&now>=metadata.createdAt&&now-metadata.createdAt<24*60*60*1000;
 const current=mediaReferences(legacy).get(url)??[];
 return metadata.bindings.some(binding=>{
  if(!current.some(b=>b.domain===binding.domain&&b.id===binding.id))return false;
  const row=(legacy[binding.domain] as any[]).find(item=>item.id===binding.id);if(!row)return false;
  if(binding.domain==='users')return !row.isDeleted;
  if(binding.domain==='tasks')return canViewLegacyTask(row,actor);
  if(binding.domain==='notes')return canViewLegacyNote(row,actor);
  if(binding.domain==='documents')return canViewLegacyDocument(row,actor);
  return isAdult(actor);
 });
}
export function reconcileMediaMetadata(tx:AppWriteTx):void {
 for(const row of tx.all("SELECT key,value FROM app_meta WHERE key LIKE 'media:%'")){canonicalMediaUrl(row.key.slice(6));parseMediaMetadata(row.value);}
 for(const [url,bindings] of mediaReferences(tx.legacy))if(!tx.get('SELECT value FROM app_meta WHERE key=?',mediaKey(url)))tx.run('INSERT INTO app_meta VALUES (?,?)',mediaKey(url),JSON.stringify({version:1,ownerId:null,createdAt:0,bindings}));
 const version=tx.get('SELECT value FROM app_meta WHERE key=?','media_version');if(version&&version.value!=='1')throw new Error('Unsupported media version');
 tx.run('INSERT OR REPLACE INTO app_meta VALUES (?,?)','media_version','1');
}
export function bindMediaChanges(tx:AppWriteTx,before:Map<string,MediaBinding[]>,actorId:string):void {
 if(tx.get('SELECT value FROM app_meta WHERE key=?','media_version')?.value!=='1')return;
 for(const [url,bindings] of mediaReferences(tx.legacy)){
  const added=bindings.filter(b=>!(before.get(url)??[]).some(old=>old.domain===b.domain&&old.id===b.id));if(!added.length)continue;
  const stored=tx.get('SELECT value FROM app_meta WHERE key=?',mediaKey(url));if(!stored)throw new AppStoreError('Không được gắn tệp này.',403);
  const metadata=parseMediaMetadata(stored.value);
  if(metadata.bindings.length){if(added.some(b=>!metadata.bindings.some(old=>old.domain===b.domain&&old.id===b.id)))throw new AppStoreError('Không được gắn tệp này.',403);}
  else {
   if(metadata.ownerId!==actorId||Date.now()-metadata.createdAt>=24*60*60*1000||added.length!==1)throw new AppStoreError('Không được gắn tệp này.',403);
   metadata.bindings=added;tx.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(metadata),mediaKey(url));
  }
 }
}
