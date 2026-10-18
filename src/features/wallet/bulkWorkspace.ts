import type {WalletApi} from './api.js';
import {WalletApiError} from './api.js';
import {createWalletCommand,type WalletCommandState} from './commandState.js';
import type {bulkPreviewValue} from './bulkDto.js';
import type {RecordFilter} from './contracts.js';
import type {WalletRecordView} from '../../../server/wallet/query.js';
import type {BulkSelection,RecordMetadataPatch,BulkResult} from '../../../server/wallet/bulk.js';
import type {SelectionSummary} from '../../../server/wallet/selections.js';
type Api=Partial<Pick<WalletApi,'createSelection'|'selectionMembers'|'releaseSelection'|'bulkPreview'|'bulkMetadata'>>;
type Preview=ReturnType<typeof bulkPreviewValue>;
export interface BulkView {phase:string;supported:boolean;filter:RecordFilter;items:WalletRecordView[];total:number}
export interface BulkWorkspaceState {
    phase:'unavailable'|'checking'|'ready'|'disposed';
    mode:'loaded'|'snapshot';selectedCount:number;checkedIds:string[];
    patch:RecordMetadataPatch;preview:Preview|null;previewPending:boolean;
    command:WalletCommandState<never>;commandKind:'capture'|'apply'|null;
    error:WalletApiError|null;result:BulkResult|null;
}
type Intent={kind:'capture';filter:RecordFilter}|{kind:'apply';selection:BulkSelection;revision:number;patch:RecordMetadataPatch};
type Result=SelectionSummary|BulkResult;
/** Lives above Finance navigation. All financial intent is memory-only and
 * disposed by the session owner. Read refreshes never rebase captured revisions. */
export function createBulkWorkspace(api:Api,options:{canMutate:()=>boolean;newRequestId?:()=>string;onApplied:()=>void|Promise<void>;onScopeDenied?:(error:WalletApiError)=>void}){
    let view:BulkView|null=null,disposed=false,generation=0,previewPending=false;
    let stage:{summary:SelectionSummary;filter:RecordFilter}|null=null,members=new Set<string>(),exclusions=new Set<string>();
    const checked=new Map<string,number>(),listeners=new Set<()=>void>();
    let draft:RecordMetadataPatch={},previewValue:Preview|null=null,pinned:{hash:string;input:Extract<Intent,{kind:'apply'}>}|null=null;
    let commandKind:'capture'|'apply'|null=null,lastIntent:Intent|null=null,error:WalletApiError|null=null,result:BulkResult|null=null;
    let state:BulkWorkspaceState={phase:'unavailable',mode:'loaded',selectedCount:0,checkedIds:[],patch:{},preview:null,previewPending:false,command:{phase:'idle'},commandKind:null,error:null,result:null};
    const command=createWalletCommand<Intent,Result>({newRequestId:options.newRequestId,execute:(intent,nonce)=>{
        if(intent.kind==='capture'){if(!api.createSelection)throw new WalletApiError(409,'Vùng chọn chưa sẵn sàng.','CONFLICT',nonce);return api.createSelection({filter:intent.filter},nonce);}
        if(!api.bulkMetadata)throw new WalletApiError(409,'Cập nhật hàng loạt chưa sẵn sàng.','CONFLICT',nonce);
        return api.bulkMetadata(intent.selection,intent.revision,intent.patch,nonce);
    }});
    const unresolved=()=>['pending','unknown'].includes(command.snapshot().phase),available=()=>!!view&&view.phase==='ready'&&view.supported;
    const isBusy=()=>unresolved()||previewPending;
    function publish(){
        if(disposed)return;
        const ready=available(),{result:_result,...status}=command.snapshot();
        state=Object.freeze({phase:ready?'ready':view?.phase==='checking'?'checking':'unavailable',mode:stage?'snapshot':'loaded',selectedCount:ready?(stage?stage.summary.count-exclusions.size:checked.size):0,checkedIds:ready?view!.items.filter(row=>stage?members.has(row.record.id)&&!exclusions.has(row.record.id):checked.has(row.record.id)).map(row=>row.record.id):[],patch:ready?structuredClone(draft):{},preview:ready&&previewValue?structuredClone(previewValue):null,previewPending,command:status,commandKind,error,result});
        for(const listener of listeners)listener();
    }
    const unsubscribe=command.subscribe(publish),editable=()=>!disposed&&available()&&options.canMutate()&&!isBusy();
    const failure=(value:unknown)=>value instanceof WalletApiError?value:new WalletApiError(0,'Không xử lý được vùng chọn.','NETWORK_ERROR',undefined);
    function invalidate(){previewValue=null;pinned=null;error=null;result=null;}
    function release(){const id=stage?.summary.id;stage=null;members.clear();exclusions.clear();if(id&&api.releaseSelection){const nonce=(options.newRequestId??(()=>crypto.randomUUID()))();void api.releaseSelection(id,nonce).catch(()=>{});}}
    function clearLocal(){release();checked.clear();draft={};invalidate();}
    function selection():BulkSelection|null {
        if(stage)return {selectionId:stage.summary.id,filter:structuredClone(stage.filter),excludeIds:[...exclusions].sort()};
        if(!checked.size)return null;
        return {ids:[...checked.keys()],revisions:Object.fromEntries(checked)};
    }
    async function membership(current:number){
        if(!stage||!available())return;
        if(!api.selectionMembers)throw new WalletApiError(409,'Vùng chọn chưa sẵn sàng.','CONFLICT',undefined);
        const id=stage.summary.id,ids=view!.items.map(row=>row.record.id),found=new Set<string>();
        for(let offset=0;offset<ids.length;offset+=100){const page=await api.selectionMembers(id,ids.slice(offset,offset+100));if(disposed||current!==generation||stage?.summary.id!==id)return;for(const id of page)found.add(id);}
        if(!disposed&&current===generation&&stage?.summary.id===id)members=found;
    }
    async function finish(){
        if(disposed||command.snapshot().phase!=='success'||!lastIntent)return;
        const completed=lastIntent,value=command.snapshot().result!;lastIntent=null;
        if(completed.kind==='capture'){
            stage={summary:structuredClone(value as SelectionSummary),filter:completed.filter};checked.clear();members.clear();exclusions.clear();invalidate();
            if(available()&&JSON.stringify(view!.filter)!==JSON.stringify(stage.filter)){clearLocal();publish();return;}
            try{await membership(generation);}catch(cause){if(!disposed){error=failure(cause);members.clear();}}
            publish();
        }else{
            stage=null;members.clear();exclusions.clear();checked.clear();draft={};previewValue=null;pinned=null;error=null;result=value as BulkResult;publish();
            await options.onApplied();
        }
    }
    return {
        exportSelection:()=>!disposed&&available()&&!isBusy()?structuredClone(selection()):null,
        snapshot:()=>state,subscribe(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};},isBusy,
        async setView(next:BulkView){
            if(disposed)return;
            const current=++generation,changed=!!view&&JSON.stringify(view.filter)!==JSON.stringify(next.filter);
            view={...next,filter:structuredClone(next.filter),items:next.items};previewPending=false;previewValue=null;pinned=null;members.clear();
            if(changed&&!unresolved())clearLocal();
            publish();
            try{await membership(current);}catch(cause){if(!disposed&&current===generation){error=failure(cause);members.clear();}}
            if(!disposed&&current===generation)publish();
        },
        toggle(id:string,value:boolean){
            if(!editable())return;
            const row=view!.items.find(row=>row.record.id===id);if(!row)return;
            if(stage){if(!members.has(id))return;if(value)exclusions.delete(id);else exclusions.add(id);}
            else if(value){if(!checked.has(id))checked.set(id,row.record.revision);}else checked.delete(id);
            invalidate();publish();
        },
        setPatch(value:RecordMetadataPatch){if(!editable())return;draft=structuredClone(value);invalidate();publish();},
        clear(){if(disposed||isBusy())return;clearLocal();commandKind=null;command.reset();publish();},
        async selectAllMatching(){
            if(!editable())return;release();invalidate();command.reset();commandKind='capture';lastIntent={kind:'capture',filter:structuredClone(view!.filter)};publish();
            await command.submit(lastIntent);await finish();
        },
        async preview(){
            if(!editable())return;const selected=selection();if(!selected||!state.selectedCount||!Object.keys(draft).length||!api.bulkPreview)return;
            const current=++generation,input:Extract<Intent,{kind:'apply'}>={kind:'apply',selection:structuredClone(selected),revision:'selectionId' in selected?1:0,patch:structuredClone(draft)};
            invalidate();previewPending=true;publish();
            try{const value=await api.bulkPreview(input.selection,input.patch);if(disposed||current!==generation||!available())return;previewValue=structuredClone(value);pinned={hash:value.intentHash,input};}
            catch(cause){if(!disposed&&current===generation){error=failure(cause);previewValue=null;pinned=null;if([403,404].includes(error.status))options.onScopeDenied?.(error);}}
            finally{if(!disposed&&current===generation){previewPending=false;publish();}}
        },
        async apply(expectedHash:string){
            if(!editable())return;
            if(!pinned||pinned.hash!==expectedHash){error=new WalletApiError(409,'Xem lại thay đổi trước khi xác nhận.','CONFLICT',undefined);publish();return;}
            lastIntent=structuredClone(pinned.input);command.reset();commandKind='apply';error=null;publish();await command.submit(lastIntent);if([403,404].includes(command.snapshot().error?.status??0))options.onScopeDenied?.(command.snapshot().error!);await finish();
        },
        async retry(){if(disposed||!available()||!options.canMutate()||command.snapshot().phase!=='unknown')return;await command.retry();await finish();},
        dispose(){if(disposed)return;generation++;disposed=true;unsubscribe();command.dispose();checked.clear();stage=null;members.clear();exclusions.clear();view=null;draft={};previewValue=null;pinned=null;lastIntent=null;state={phase:'disposed',mode:'loaded',selectedCount:0,checkedIds:[],patch:{},preview:null,previewPending:false,command:{phase:'disposed'},commandKind:null,error:null,result:null};for(const listener of listeners)listener();listeners.clear();},
    };
}
export type BulkWorkspace=ReturnType<typeof createBulkWorkspace>;
