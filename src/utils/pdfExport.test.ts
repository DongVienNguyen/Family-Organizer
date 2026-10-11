import { afterEach,expect,it,vi } from 'vitest';
import { browserSession } from './browserSession.js';
import { exportFinanceReportPdf,exportEmergencyCardPdf } from './pdfExport.js';
const held=vi.hoisted(()=>({release:undefined as undefined|((blob:Blob)=>void),entered:undefined as undefined|(()=>void)}));
vi.mock('pdfmake/build/pdfmake',()=>({default:{addVirtualFileSystem:()=>{},createPdf:()=>({getBlob:()=>{held.entered!();return new Promise<Blob>(resolve=>{held.release=resolve;});}})}}));
vi.mock('pdfmake/build/vfs_fonts',()=>({default:{}}));
afterEach(()=>{vi.unstubAllGlobals();});
it('does not share or download a private PDF whose generation completes after user switch',async()=>{
  const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
  const clicked=vi.fn(),url=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:synthetic'),revoked=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  vi.stubGlobal('document',{createElement:()=>({click:clicked})});vi.stubGlobal('navigator',{canShare:()=>false});
  await browserSession.change('A');
  let enter!:()=>void;const entered=new Promise<void>(resolve=>{enter=resolve;});held.entered=enter;
  const pending=exportFinanceReportPdf({periodLabel:'Synthetic',totals:{totalIncome:0,totalExpense:0,balance:0},byCategory:[],accountBalances:[],transactions:[],generatedBy:'Synthetic A'});
  try{await entered;await browserSession.change('B');held.release!(new Blob(['synthetic-private'],{type:'application/pdf'}));await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(url).not.toHaveBeenCalled();expect(clicked).not.toHaveBeenCalled();}
  finally{url.mockRestore();revoked.mockRestore();}
});

it.each(['finance','emergency'])('preserves current-session %s PDF downloads',async kind=>{
  const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
  const clicked=vi.fn(),url=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:synthetic'),revoked=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  vi.stubGlobal('document',{createElement:()=>({click:clicked})});vi.stubGlobal('navigator',{canShare:()=>false});await browserSession.change('A');
  let enter!:()=>void;const entered=new Promise<void>(resolve=>{enter=resolve;});held.entered=enter;
  const pending=kind==='finance'?exportFinanceReportPdf({periodLabel:'Synthetic',totals:{totalIncome:0,totalExpense:0,balance:0},byCategory:[],accountBalances:[],transactions:[],generatedBy:'Synthetic A'}):exportEmergencyCardPdf({fullName:'Synthetic A',contacts:[]});
  try{await entered;held.release!(new Blob(['synthetic-private'],{type:'application/pdf'}));await pending;expect(url).toHaveBeenCalledOnce();expect(clicked).toHaveBeenCalledOnce();expect(revoked).toHaveBeenCalledWith('blob:synthetic');}
  finally{url.mockRestore();revoked.mockRestore();}
});
