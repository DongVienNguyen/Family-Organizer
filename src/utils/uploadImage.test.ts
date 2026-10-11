import {afterEach,expect,it,vi} from 'vitest';
import {browserSession} from './browserSession.js';
import {optimizeAndUpload} from './uploadImage.js';
const image=vi.hoisted(()=>({finish:undefined as undefined|((value:any)=>void)}));
vi.mock('./image.js',()=>({optimizeImageFile:()=>new Promise(resolve=>{image.finish=resolve;})}));
afterEach(()=>vi.unstubAllGlobals());
async function fixture(){
  const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
  vi.stubGlobal('navigator',{});const sent=vi.fn(async(_input:any,_init:any)=>new Response('{"url":"/uploads/synthetic.png"}'));vi.stubGlobal('fetch',sent);await browserSession.change('A');return sent;
}
const optimized={dataUrl:'data:image/png;base64,U1lOVEhFVElD',width:1,height:1,sizeKb:1};
it('rejects A image processing that completes after switching to B before uploading',async()=>{
  const sent=await fixture(),pending=optimizeAndUpload(new File(['synthetic'],'a.png',{type:'image/png'}),'receipts');
  await browserSession.change('B');image.finish!(optimized);
  await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(sent).not.toHaveBeenCalled();
});
it('preserves image processing and uploading within the captured session',async()=>{
  const sent=await fixture(),pending=optimizeAndUpload(new File(['synthetic'],'a.png',{type:'image/png'}),'receipts');image.finish!(optimized);
  expect(await pending).toEqual({...optimized,url:'/uploads/synthetic.png'});expect(sent).toHaveBeenCalledOnce();expect(new Headers(sent.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer A');
});
