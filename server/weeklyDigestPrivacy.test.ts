import {withAppCommandContext} from './commandContext.js';
import {AppStoreError} from './appErrors.js';
import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {FamilyDB,getAppSettings,replaceAppSettings,setAppSetting} from './db.js';
import {withAppWriteTransaction} from './appStore.js';
import {sendWeeklyDigest,runWeeklyDigestTick} from './weeklyDigest.js';
import {UserRole} from '../src/types.js';
const {generate}=vi.hoisted(()=>({generate:vi.fn()}));
vi.mock('@google/genai',()=>({GoogleGenAI:class{models={generateContent:generate};}}));
const now=new Date('2026-01-05T08:00:00');
const seed=FamilyDB.getUsers()[0];
const admin={...seed,id:'digest-admin-a',username:'digest-admin-a',fullName:'Synthetic digest owner',role:UserRole.ADMIN,isDeleted:false};
const other={...seed,id:'digest-admin-b',username:'digest-admin-b',fullName:'Synthetic other owner',role:UserRole.ADMIN,isDeleted:false};
const fetch=vi.fn(async()=>({ok:true,status:200,json:async()=>({ok:true})}));
function write(change:(db:any)=>void){withAppWriteTransaction({actorId:admin.id,command:'synthetic:digest-fixture',requestId:randomUUID(),payloadHash:'fixture'},tx=>change(tx.legacy));}
function configure(ai=false){replaceAppSettings({telegramBotToken:'synthetic-digest-token',telegramChatId:'synthetic-digest-chat',telegramWeeklyDigestEnabled:'1',telegramWeeklyDigestOwnerId:admin.id,...(ai?{geminiApiKey:'synthetic-digest-ai-key'}:{})});}
const send=(requester?:any)=>(sendWeeklyDigest as any)(now,requester);
const body=()=>JSON.parse(String((fetch.mock.calls as any)[0]?.[1]?.body||'{}')).text;
beforeEach(()=>{
 vi.clearAllMocks();generate.mockReset();fetch.mockImplementation(async()=>({ok:true,status:200,json:async()=>({ok:true})}));vi.stubGlobal('fetch',fetch);
 write(db=>{db.users=[admin,other];db.tasks=[];db.plans=[];db.documents=[];db.transactions=[];});configure();
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
function documents(){write(db=>{db.documents=[...Array.from({length:7},(_,i)=>({id:'private-'+i,title:'SYNTHETIC_PRIVATE_'+i,type:'other',creatorId:other.id,ownerId:other.id,isShared:false,expiryDate:'2026-01-10',files:[]})),{id:'visible',title:'SYNTHETIC_VISIBLE',type:'other',creatorId:admin.id,ownerId:admin.id,isShared:false,expiryDate:'2026-01-15',files:[]}];});}
it('filters private documents before top-five fallback aggregation',async()=>{documents();expect(await send()).toEqual({aiUsed:false});expect(body()).not.toContain('SYNTHETIC_PRIVATE');expect(body()).toContain('SYNTHETIC_VISIBLE');});
it('filters the actual AI prompt before aggregation and supports the SDK text property',async()=>{documents();configure(true);generate.mockResolvedValue({text:'Synthetic AI digest'});expect(await send()).toEqual({aiUsed:true});expect(generate.mock.calls[0][0].contents).not.toContain('SYNTHETIC_PRIVATE');expect(generate.mock.calls[0][0].contents).toContain('SYNTHETIC_VISIBLE');expect(body()).toContain('Synthetic AI digest');});
it.each(['missing','unknown','deleted','child','member','unknown-role'])('refuses %s configured digest owner before any external dispatch',async kind=>{
 if(kind==='missing')setAppSetting('telegramWeeklyDigestOwnerId',null);
 else if(kind==='unknown')setAppSetting('telegramWeeklyDigestOwnerId','synthetic-missing');
 else write(db=>{const u=db.users[0];if(kind==='deleted')u.isDeleted=true;else u.role=kind==='unknown-role'?'synthetic-unknown':kind;});
 await expect(send()).rejects.toMatchObject({unknownOutcome:false});expect(fetch).not.toHaveBeenCalled();expect(generate).not.toHaveBeenCalled();
});
it('refuses an alternate manual Admin before AI or Telegram dispatch',async()=>{await expect(send({userId:other.id,isCurrent:()=>true})).rejects.toMatchObject({unknownOutcome:false});expect(fetch).not.toHaveBeenCalled();});
it.each(['role','deleted','password','token','chat','key','owner','document','session','enabled'])('revalidates %s while an owned AI request is pending',async kind=>{
 documents();configure(true);let release!:(x:any)=>void;const held=new Promise(resolve=>{release=resolve;});generate.mockReturnValue(held);let current=true;
 const pending=send({userId:admin.id,isCurrent:()=>current});const checked=expect(pending).rejects.toMatchObject({unknownOutcome:false});
 try{await vi.waitFor(()=>expect(generate).toHaveBeenCalledTimes(1));
 if(kind==='role')write(db=>{db.users[0].role=UserRole.MEMBER;});
 if(kind==='deleted')write(db=>{db.users[0].isDeleted=true;});
 if(kind==='password')write(db=>{db.users[0].passwordHash=other.passwordHash+'changed';});
 if(kind==='token')setAppSetting('telegramBotToken','synthetic-new-token');
 if(kind==='chat')setAppSetting('telegramChatId','synthetic-new-chat');
 if(kind==='key')setAppSetting('geminiApiKey','synthetic-new-ai-key');
 if(kind==='owner')setAppSetting('telegramWeeklyDigestOwnerId',other.id);
 if(kind==='document')write(db=>{db.documents.find((d:any)=>d.id==='visible').title='SYNTHETIC_CHANGED';});
 if(kind==='session')current=false;
 if(kind==='enabled')setAppSetting('telegramWeeklyDigestEnabled',null);
 release({text:'Synthetic held digest'});await checked;expect(fetch).not.toHaveBeenCalled();expect(getAppSettings().telegramWeeklyDigestLastSent).toBeUndefined();
 }finally{release({text:'Synthetic released fixture'});await pending.catch(()=>{});}
});
it('bounds stalled AI work, aborts it and sends the filtered fallback',async()=>{
 configure(true);vi.useFakeTimers();let release!:(x:any)=>void;generate.mockReturnValue(new Promise(resolve=>{release=resolve;}));let done=false;const pending=send().then((result:any)=>{done=true;return result;});
 try{await vi.advanceTimersByTimeAsync(0);expect(generate).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(15000);expect(done).toBe(true);expect(generate.mock.calls[0][0].config.abortSignal.aborted).toBe(true);expect(await pending).toEqual({aiUsed:false});expect(fetch).toHaveBeenCalledTimes(1);
 }finally{release?.({text:'Synthetic released fixture'});await pending.catch(()=>{});}
});
it('does not copy provider error payloads into logs or delivery',async()=>{
 configure(true);const log=vi.spyOn(console,'error').mockImplementation(()=>{});generate.mockRejectedValue(new Error('SYNTHETIC_PRIVATE_PROVIDER_KEY_AND_PROMPT'));
 expect(await send()).toEqual({aiUsed:false});expect(JSON.stringify(log.mock.calls)).not.toContain('SYNTHETIC_PRIVATE_PROVIDER');expect(body()).not.toContain('SYNTHETIC_PRIVATE_PROVIDER');
});
it('rejects oversized legacy-function AI output and retains fallback',async()=>{configure(true);generate.mockResolvedValue({text:()=> 'SYNTHETIC_OVERSIZE'.repeat(500)});expect(await send()).toEqual({aiUsed:false});expect(body()).not.toContain('SYNTHETIC_OVERSIZE');});
it('escapes provider-controlled HTML as plain Telegram text',async()=>{configure(true);generate.mockResolvedValue({text:()=>'<a href="https://synthetic.invalid">Synthetic link</a>'});await send();expect(body()).not.toContain('<a ');});
it('keeps a failed unbound scheduled digest retryable without recording lastSent',async()=>{setAppSetting('telegramWeeklyDigestOwnerId',null);await expect(runWeeklyDigestTick(now)).rejects.toMatchObject({unknownOutcome:false});expect(getAppSettings().telegramWeeklyDigestLastSent).toBeUndefined();expect(fetch).not.toHaveBeenCalled();});
it('preserves permitted finance, Admin plan visibility and stable AI delivery',async()=>{
 write(db=>{db.transactions=[{id:'synthetic-income',type:'income',amount:25,date:'2026-01-04',category:'other'}];db.plans=[{id:'synthetic-plan',title:'Synthetic Admin-visible plan',creatorId:other.id,isShared:false,startDate:'2026-01-06'}];});
 await send();expect(body()).toContain('25');expect(body()).toContain('Synthetic Admin-visible plan');
});
it('keeps oversized legacy fallback deliverable without breaking escaped entities',async()=>{write(db=>{db.documents=[{id:'synthetic-long-document',title:'SYNTHETIC_BIG_'+ '<>&'.repeat(4000),type:'other',creatorId:admin.id,ownerId:admin.id,isShared:false,expiryDate:'2026-01-15',files:[]}];});await send();expect(body()).toContain('SYNTHETIC_BIG');expect(body().length).toBeLessThanOrEqual(4096);expect(body()).not.toMatch(/<(?!\/?b>)/);expect(body()).not.toMatch(/&(?:a|am|amp|l|lt|g|gt)?\n…$/);});
it('escapes legacy expense category markup in the fallback',async()=>{write(db=>{db.transactions=[{id:'synthetic-markup-expense',type:'expense',amount:25,date:'2026-01-04',category:'SYNTHETIC_CATEGORY_<a href="https://synthetic.invalid">link</a>'}];});await send();expect(body()).toContain('SYNTHETIC_CATEGORY_&lt;a');expect(body()).not.toContain('<a ');});
it('retains an unsafe-key legacy category as ordinary own data',async()=>{write(db=>{db.transactions=[{id:'synthetic-prototype-expense',type:'expense',amount:25,date:'2026-01-04',category:'__proto__'}];});await send();expect(body()).toContain('Top chi: __proto__ 25');expect(({} as any).polluted).toBeUndefined();});
it('escapes HTML from the supported SDK text property while retaining AI success',async()=>{configure(true);generate.mockResolvedValue({text:'<a href="https://synthetic.invalid">Synthetic supported link</a>'});expect(await send()).toEqual({aiUsed:true});expect(body()).toBe('&lt;a href="https://synthetic.invalid"&gt;Synthetic supported link&lt;/a&gt;');expect(body()).not.toContain('<a ');});

it.each(['initial','across-import'])('fences an expired owned lease %s before Gemini dispatch',async timing=>{
 configure(true);generate.mockResolvedValue({text:'Synthetic fenced AI response'});let owned=timing!=='initial';
 const pending=withAppCommandContext({actorId:admin.id,requestId:randomUUID(),assertWriteOwnership:()=>{if(!owned)throw new AppStoreError('Synthetic digest lease expired',409);}},()=>runWeeklyDigestTick(now));
 owned=false;
 await expect(pending).rejects.toMatchObject({unknownOutcome:false});expect(generate).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(getAppSettings().telegramWeeklyDigestLastSent).toBeUndefined();
});
it.each(['raw','escaped'])('refuses oversized supported SDK %s text and delivers filtered bounded fallback',async kind=>{documents();configure(true);generate.mockResolvedValue({text:kind==='raw'?'SYNTHETIC_RAW_OVERSIZE_'.repeat(300):'<'.repeat(2000)});expect(await send()).toEqual({aiUsed:false});expect(generate).toHaveBeenCalledTimes(1);expect(fetch).toHaveBeenCalledTimes(1);expect(body()).toContain('SYNTHETIC_VISIBLE');expect(body()).not.toContain('SYNTHETIC_PRIVATE');expect(body()).not.toContain('SYNTHETIC_RAW_OVERSIZE');expect(body().length).toBeLessThanOrEqual(4096);});
