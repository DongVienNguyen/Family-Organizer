import {useEffect,useRef,useState,useId} from 'react';
import {useTranslation} from 'react-i18next';
import {useConfirm} from '../../components/ConfirmDialog.js';
import {prepareWalletReceipt} from './receiptInput.js';
import type {RecordWorkspace,RecordWorkspaceState} from './recordWorkspace.js';
export function ReceiptPanel({workspace,state}:{workspace:RecordWorkspace;state:RecordWorkspaceState}){
 const {t}=useTranslation(),{confirm,ConfirmDialog}=useConfirm(),inputId=useId(),hintId=inputId+'-hint',live=useRef(true),[preparing,setPreparing]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 const selected=state.selected;if(!selected||selected.partial||!state.receiptStorage)return null;
 const busy=preparing||state.phase!=='ready'||['pending','unknown'].includes(state.command.phase)||!!state.form,record=selected.record;
 async function choose(file:File|undefined){
  if(!file||busy)return;setPreparing(true);setError(false);
  try{const input=await prepareWalletReceipt(file);if(live.current)await workspace.attachReceipt(record.id,record.revision,input);}catch{if(live.current)setError(true);}finally{if(live.current)setPreparing(false);}
 }
 async function download(id:string){
  setPreparing(true);setError(false);
  try{const file=await workspace.downloadReceipt(id);if(!live.current||!file)return;const url=URL.createObjectURL(file.blob),link=document.createElement('a');link.href=url;link.download=file.fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
  catch{if(live.current)setError(true);}finally{if(live.current)setPreparing(false);}
 }
 async function detach(id:string){if(await confirm({title:t('wallet.receipts.remove'),message:t('wallet.receipts.removeConfirm'),tone:'danger'}))await workspace.detachReceipt(record.id,record.revision,id);}
 return <section aria-label={t('wallet.receipts.title')} className="border-t border-slate-800 pt-3 space-y-3">
  <h4 className="text-xs font-bold text-slate-200">{t('wallet.receipts.title')} ({state.receipts.length}/20)</h4>
  {!state.receipts.length&&<p className="text-xs text-slate-400">{t('wallet.receipts.empty')}</p>}
  {state.receipts.map(receipt=><div key={receipt.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-900 p-3"><span className="text-xs text-slate-200 break-all flex-1">{receipt.fileName}</span><button type="button" disabled={busy} onClick={()=>void download(receipt.id)} aria-label={t('wallet.receipts.download')+' '+receipt.fileName} className="bg-slate-800 text-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold cursor-pointer disabled:opacity-60">{t('wallet.receipts.download')}</button>{workspace.canManageReceipts()&&<button type="button" disabled={busy} onClick={()=>void detach(receipt.id)} aria-label={t('wallet.receipts.remove')+' '+receipt.fileName} className="bg-rose-500/10 text-rose-400 rounded-xl px-3 py-2.5 text-xs font-bold cursor-pointer disabled:opacity-60">{t('wallet.receipts.remove')}</button>}</div>)}
  {workspace.canManageReceipts()&&<div className="block space-y-2 text-xs text-slate-300"><label htmlFor={inputId}>{t('wallet.receipts.attach')}</label><input id={inputId} aria-describedby={hintId} type="file" disabled={busy||state.receipts.length>=20} accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,.heic,.heif,application/pdf" onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';void choose(file);}} className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-800 file:text-slate-200 file:px-3 file:py-2.5 disabled:opacity-60"/><p id={hintId} className="block text-xs text-slate-400">{t('wallet.receipts.limits')}</p></div>}
  {preparing&&<p role="status" className="text-xs text-slate-400">{t('wallet.receipts.preparing')}</p>}{error&&<p role="alert" className="text-xs text-rose-400">{t('wallet.receipts.failed')}</p>}{ConfirmDialog}
 </section>;
}
