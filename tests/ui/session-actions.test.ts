import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';
import {createSessionBoundary} from '../../src/utils/sessionBoundary.js';
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(finish=>{resolve=finish;});return {promise,resolve};}
function callback(file:string,name:string,next:string,context:Record<string,any>){
  const source=fs.readFileSync(new URL('../../src/components/'+file,import.meta.url),'utf8');
  const body=source.slice(source.indexOf('  const '+name+' ='),source.indexOf('  const '+next+' ='))+'\nglobalThis.run='+name+';';
  vm.runInNewContext(ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);return context.run;
}
async function fixture(){
  let token:string|null=null;const sent=vi.fn(async(input:any,_init:any)=>new Response(JSON.stringify(String(input).includes('vapid')?{publicKey:'AQID'}:{success:true})));
  const boundary=createSessionBoundary({origin:'https://family.test',request:sent as any,readToken:()=>token,writeToken:value=>{token=value;},purge:async()=>{}});await boundary.change('A');
  return {boundary,sent,authHeaders:()=>({Authorization:'Bearer '+token})};
}
const optimized={dataUrl:'data:image/png;base64,U1lOVEhFVElD',width:1,height:1,sizeKb:1};
it.each(['avatar','assets','document'].flatMap(kind=>[ [kind,true],[kind,false] ] as const))('%s processing preserves session ownership (switch=%s)',async(kind,switchUser)=>{
  const f=await fixture(),processing=deferred<any>(),uploaded=vi.fn(async()=>'/uploads/synthetic.png');let read!:()=>void;
  const context:any={browserSession:f.boundary,optimizeImageFile:()=>processing.promise,uploadDataUrl:uploaded,t:(key:string)=>key,formPhotos:[],formType:'synthetic',MAX_ASSET_PHOTOS:10,files:[],MAX_DOC_FILES:10};
  for(const setter of ['setActionError','setActionSuccess','setAvatarProcessing','setProfAvatarImage','setFormError','setImageProcessing','setFormPhotos','setError','setUploading','setFiles'])context[setter]=vi.fn();
  context.FileReader=class{result='data:application/pdf;base64,U1lOVEhFVElD';onload!:()=>void;readAsDataURL(){read=()=>this.onload();}};
  const file=new File(['synthetic'],'synthetic.'+(kind==='document'?'pdf':'png'),{type:kind==='document'?'application/pdf':'image/png'});
  const run=kind==='avatar'?callback('Settings.tsx','handleAvatarFile','handleSaveProfile',context):kind==='assets'?callback('Assets.tsx','addPhotoFiles','handlePhotoFiles',context):callback('Documents.tsx','addPickedFiles','handleFilePick',context);
  const pending=run(kind==='avatar'?{target:{files:[file],value:''}}:[file]);if(switchUser)await f.boundary.change('B');
  if(kind==='document')read();else processing.resolve(optimized);await pending;
  expect(uploaded).toHaveBeenCalledTimes(switchUser?0:kind==='assets'?2:1);
});

it.each(['enable','disable'])('preserves current-session push %s behavior with offline browser adapters',async action=>{
  const f=await fixture(),sub={endpoint:'https://synthetic.invalid/device',unsubscribe:vi.fn(async()=>true)},subscribed=vi.fn();
  const context:any={browserSession:f.boundary,fetch:f.boundary.request,authHeaders:f.authHeaders,Notification:{requestPermission:async()=> 'granted'},navigator:{serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>sub}})}},urlBase64ToUint8Array:()=>new Uint8Array(),setBusy:vi.fn(),setMsg:vi.fn(),setPerm:vi.fn(),setSubscribed:subscribed,t:(key:string)=>key};
  await callback('PushNotificationsCard.tsx',action,action==='enable'?'disable':'sendTest',context)();
  expect(f.sent).toHaveBeenCalledWith('/api/push/'+(action==='enable'?'subscribe':'unsubscribe'),expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer A'})}));
  expect(subscribed).toHaveBeenCalledWith(action==='enable');expect(sub.unsubscribe).toHaveBeenCalledTimes(action==='disable'?1:0);
});

it.each(['document','debt'])('a delayed %s batch cannot start the next upload under B',async kind=>{
  const f=await fixture(),held=deferred<any>(),upload=vi.fn(async()=>held.promise);
  const context:any={browserSession:f.boundary,optimizeAndUpload:upload,files:[],attachments:[],MAX_DOC_FILES:10,t:(key:string)=>key,setError:vi.fn(),setUploading:vi.fn(),setFiles:vi.fn(),setAttachments:vi.fn()};
  const files=[new File(['synthetic'],'one.png',{type:'image/png'}),new File(['synthetic'],'two.png',{type:'image/png'})];
  const run=kind==='document'?callback('Documents.tsx','addPickedFiles','handleFilePick',context):callback('DebtTracker.tsx','handleAttach','handleCreate',context);
  const pending=run(kind==='document'?files:{target:{files,value:''}});await f.boundary.change('B');held.resolve({url:'/uploads/synthetic.png',sizeKb:1});await pending;expect(upload).toHaveBeenCalledOnce();
});

it.each([true,false])('restore confirmation preserves session ownership (switch=%s)',async switchUser=>{
  const f=await fixture(),held=deferred<boolean>(),context:any={browserSession:f.boundary,fetch:f.boundary.request,authHeaders:f.authHeaders,confirm:()=>held.promise,setActionError:vi.fn(),setActionSuccess:vi.fn(),setLoadingAction:vi.fn(),setTimeout:vi.fn()};
  const run=callback('Settings.tsx','handleFullImportFile','handleDeleteUserClick',context);
  const pending=run({target:{files:[new File(['synthetic'],'backup.zip')],value:''}});if(switchUser)await f.boundary.change('B');held.resolve(true);await pending;expect(f.sent).toHaveBeenCalledTimes(switchUser?0:1);
});

it.each(['finance','emergency'].flatMap(kind=>[[kind,true],[kind,false]] as const))('%s PDF module loading preserves session ownership (switch=%s)',async(kind,switchUser)=>{
  const f=await fixture(),held=deferred<any>(),exported=vi.fn(),context:any={browserSession:f.boundary,require:()=>held.promise,console:{error:vi.fn()},exportingPdf:false,exportingCardId:null,setExportingPdf:vi.fn(),setExportingCardId:vi.fn(),latestMeasureFor:()=>({}),tPeriodLabel:()=> 'synthetic',periodMode:'month',anchor:new Date(),metrics:{},curCatMap:{},t:(key:string)=>key,translateAccount:(key:string)=>key,periodTx:[],accountBalances:{},users:[],currentUser:{fullName:'A'},FAMILY_RELATION_LABELS:{}};
  const run=kind==='finance'?callback('Finance.tsx','exportReportPdf','anchorMonthKey',context):callback('ChildHealth.tsx','exportCardPdf','bmiFor',context);
  const pending=run({id:'synthetic-member',fullName:'A'});if(switchUser)await f.boundary.change('B');held.resolve({exportFinanceReportPdf:exported,exportEmergencyCardPdf:exported});await pending;expect(exported).toHaveBeenCalledTimes(switchUser?0:1);
});
it.each(['permission','enable-ready','existing-subscription','new-subscription','disable-ready','disable-subscription','disable-request'])('push %s keeps the initiating session lifetime',async stage=>{
  const f=await fixture(),held=deferred<any>(),sub={endpoint:'https://synthetic.invalid/device',unsubscribe:vi.fn(async()=>true)},subscribed=vi.fn(),cleared=vi.fn();
  const subscribe=vi.fn(async()=>stage==='new-subscription'?held.promise:sub);
  const reg={pushManager:{getSubscription:vi.fn(async()=>stage.endsWith('subscription')&&stage!=='new-subscription'?held.promise:stage==='new-subscription'?null:sub),subscribe}};
  let reached=false;const atHold=deferred<void>();
  const hold=()=>{reached=true;atHold.resolve();return held.promise;};
  if(stage==='existing-subscription'||stage==='disable-subscription')reg.pushManager.getSubscription.mockImplementation(hold);
  if(stage==='new-subscription')subscribe.mockImplementation(hold);
  const network=stage==='disable-request'?vi.fn(async()=>hold()):f.boundary.request;
  const context:any={browserSession:f.boundary,fetch:network,authHeaders:f.authHeaders,Notification:{requestPermission:()=>stage==='permission'?hold():Promise.resolve('granted')},navigator:{serviceWorker:{ready:stage.endsWith('ready')?hold():Promise.resolve(reg)},clearAppBadge:cleared},urlBase64ToUint8Array:()=>new Uint8Array(),setBusy:vi.fn(),setMsg:vi.fn(),setPerm:vi.fn(),setSubscribed:subscribed,t:(key:string)=>key};
  const run=stage.startsWith('disable')?callback('PushNotificationsCard.tsx','disable','sendTest',context):callback('PushNotificationsCard.tsx','enable','disable',context);
  const pending=run();if(!reached)await atHold.promise;await f.boundary.change('B');
  held.resolve(stage==='permission'?'granted':stage.endsWith('ready')?reg:stage==='disable-request'?new Response('{}'):sub);await pending;
  expect(f.sent).not.toHaveBeenCalledWith('/api/push/subscribe',expect.anything());expect(f.sent).not.toHaveBeenCalledWith('/api/push/unsubscribe',expect.anything());
  expect(sub.unsubscribe).not.toHaveBeenCalled();expect(subscribed).not.toHaveBeenCalled();expect(cleared).not.toHaveBeenCalled();
  if(stage==='permission'||stage==='enable-ready')expect(subscribe).not.toHaveBeenCalled();
});
