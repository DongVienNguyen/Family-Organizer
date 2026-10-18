import {it,expect,vi} from 'vitest';
import {createWalletApi} from './api.js';
const header=()=>({id:'schedule',name:'Synthetic rent',revision:1,mode:'manual',paused:false,archivedAt:null,catchupLimited:false});
const draft=()=>({name:'Synthetic rent',record:{kind:'expense',accountId:'a',money:{minor:'9007199254740993',currency:'VND'},effectiveDate:'2026-10-18',timezone:'Asia/Ho_Chi_Minh',note:'Synthetic',occurredAt:null,reviewedAt:null,payee:'',paymentMethod:'',settlementStatus:'cleared',categoryId:null,labelIds:[]},recurrence:{anchorDate:'2026-10-18',timezone:'Asia/Ho_Chi_Minh',frequency:'monthly',interval:1,monthEndPolicy:'clamp'},mode:'manual',paused:false,reminderDays:[3,0]});
const occurrence=()=>({id:'occurrence',scheduleId:'schedule',dueDate:'2026-11-18',timezone:'Asia/Ho_Chi_Minh',revision:1,state:'pending',recordId:null,overdue:false,draft:{...draft().record,effectiveDate:'2026-11-18'}});
const client=(value:unknown)=>{const request=vi.fn().mockResolvedValue(new Response(JSON.stringify(value),{status:200}));return {request,api:createWalletApi({request,authHeaders:()=>({Authorization:'Bearer synthetic'})})};};
it('keeps calendar previews read-only and validates exact scheduled money and identity',async()=>{
 expect(await client({schedules:[header()]}).api.schedules()).toEqual([header()]);
 expect(await client({...header(),draft:draft()}).api.schedule('schedule')).toEqual({...header(),draft:draft()});
 const f=client({items:[{ordinal:0,dueDate:'2026-10-18',timezone:'Asia/Ho_Chi_Minh'}]});
 expect(await f.api.previewSchedule(draft() as any)).toHaveLength(1);
 expect(JSON.parse(f.request.mock.calls[0][1].body)).toEqual({draft:draft()});
 expect(f.request.mock.calls[0][1].method).toBe('POST');
 expect(await client({items:[occurrence()]}).api.occurrences('schedule')).toEqual([occurrence()]);
 expect(await client(occurrence()).api.occurrence('occurrence')).toEqual(occurrence());
});
it.each(['wrong-owner','wrong-id','money','date','state','extra','duplicate'])('rejects a malformed occurrence read %s',async kind=>{
 const value:any=occurrence();if(kind==='wrong-owner')value.scheduleId='other';if(kind==='wrong-id')value.id='';if(kind==='money')value.draft.money.minor=9007199254740993;if(kind==='date')value.draft.effectiveDate='2026-10-18';if(kind==='state')value.state='confirmed';if(kind==='extra')value.actorId='other';
 await expect(client({items:kind==='duplicate'?[value,value]:[value]}).api.occurrences('schedule')).rejects.toMatchObject({code:'INVALID_RESPONSE',unknownOutcome:false});
});
it.each(['id','revision','record','state','extra'])('a malformed confirmation acknowledgement %s retains uncertainty',async kind=>{
 const v:any={id:'occurrence',revision:2,state:'confirmed',recordId:'existing'};if(kind==='id')v.id='other';if(kind==='revision')v.revision=3;if(kind==='record')v.recordId='other';if(kind==='state')v.state='skipped';if(kind==='extra')v.money={minor:'1',currency:'VND'};
 await expect(client(v).api.confirmOccurrence('occurrence',1,{linkRecordId:'existing',recordRevision:4},'synthetic-key')).rejects.toMatchObject({code:'INVALID_RESPONSE',unknownOutcome:true,requestId:'synthetic-key'});
});
it('sends only the current occurrence and linked record revisions and the explicit command key',async()=>{
 const f=client({id:'occurrence',revision:2,state:'confirmed',recordId:'existing'});
 await f.api.confirmOccurrence('occurrence',1,{linkRecordId:'existing',recordRevision:4},'synthetic-key');
 expect(f.request.mock.calls[0][0]).toBe('/api/wallet/occurrences/occurrence/confirm');
 expect(JSON.parse(f.request.mock.calls[0][1].body)).toEqual({expectedRevision:1,input:{linkRecordId:'existing',recordRevision:4}});
 expect(new Headers(f.request.mock.calls[0][1].headers).get('x-request-id')).toBe('synthetic-key');
});
it('validates schedule headers, draft binding, and bounded server-generated catch-up receipts',async()=>{
 await expect(client({schedules:[header(),header()]}).api.schedules()).rejects.toMatchObject({code:'INVALID_RESPONSE'});
 await expect(client({...header(),draft:{...draft(),name:'Other'}}).api.schedule('schedule')).rejects.toMatchObject({code:'INVALID_RESPONSE'});
 await expect(client({...header(),draft:draft()}).api.saveSchedule({draft:draft() as any},0,'synthetic-key')).rejects.toMatchObject({code:'INVALID_RESPONSE',unknownOutcome:true});
 expect(await client({id:'schedule',revision:1,created:100,limited:true}).api.materializeSchedule('schedule',1,'synthetic-key')).toEqual({id:'schedule',revision:1,created:100,limited:true});
 await expect(client({id:'schedule',revision:1,created:101,limited:false}).api.materializeSchedule('schedule',1,'synthetic-key')).rejects.toMatchObject({code:'INVALID_RESPONSE',unknownOutcome:true});
});
