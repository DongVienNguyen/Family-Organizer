import {KanbanSectionActions} from './KanbanSectionActions.js';
import React from 'react';
import {useTranslation} from 'react-i18next';
import {FancySelect} from '../../components/FancySelect.js';
import {Kanban} from './Kanban.js';
import {useKanbanWorkspace} from './useKanbanWorkspace.js';
import type {BoardPage,GroupedBoardPage} from './boardClient.js';
import type {User} from '../../types.js';
export function KanbanWorkspace({users,canManageColumns=false}:{users:User[];canManageColumns?:boolean}){
 const {t}=useTranslation(),workspace=useKanbanWorkspace(),{snapshot,controller}=workspace;const saved=workspace.views.find(v=>v.id===workspace.selected),rankSorted=saved?.config.kind==='kanban'&&saved.config.sort==='rank';
 if(!workspace.ready)return <p aria-live="polite" className="text-sm text-slate-400">{t('productivityKanban.loading')}</p>;
 return <section className="space-y-4 min-w-0" aria-label={t('productivityKanban.workspace')}>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><FancySelect ariaLabel={t('productivityKanban.picker')} value={workspace.selected} options={[{value:'',label:t('productivityKanban.choose')},...workspace.views.map(v=>({value:v.id,label:v.title}))]} onChange={workspace.choose}/><FancySelect ariaLabel={t('productivityKanban.timezone')} value={workspace.timezone} options={['Asia/Saigon','UTC','Europe/London','America/New_York'].map(value=>({value,label:value}))} onChange={workspace.setTimezone}/></div>
  {workspace.views.length===0&&<p className="text-sm text-slate-500">{t('productivityKanban.noViews')}</p>}
  {(workspace.error||snapshot.error)&&<p role="alert" className="text-[11px] text-rose-400">{t('productivityKanban.failed')}</p>}
  {!snapshot.page&&workspace.selected&&<button type="button" className="bg-slate-900 neu-btn rounded-xl px-4 py-2.5 text-xs text-slate-200 cursor-pointer disabled:opacity-60" disabled={snapshot.loading} onClick={()=>void controller.refresh()}>{snapshot.loading?t('productivityKanban.loading'):t('productivityKanban.reload')}</button>}
  {snapshot.page&&snapshot.selection&&(snapshot.selection.kind==='canonical'&&canManageColumns&&(snapshot.page as BoardPage).mode==='sections'&&rankSorted?<KanbanSectionActions key={JSON.stringify([snapshot.page.viewId,snapshot.page.viewRevision,snapshot.page.boardRevision,snapshot.page.clock])} api={workspace.state.api} page={snapshot.page as BoardPage} ready={workspace.ready} onRefresh={async()=>{controller.clear();await workspace.state.refresh();}}>{onMove=><Kanban kind="canonical" page={snapshot.page as BoardPage} users={users} tags={workspace.state.catalog.tags} loading={snapshot.loading||snapshot.loadingMore} disabled={!workspace.ready} error={snapshot.error?t('productivityKanban.failed'):''} onOpen={id=>void workspace.open(id)} onMove={onMove} onReload={()=>void controller.refresh()} onLoadMore={()=>void controller.more()}/>}</KanbanSectionActions>:<Kanban {...(snapshot.selection.kind==='canonical'?{kind:'canonical' as const,page:snapshot.page as BoardPage}:{kind:'grouped' as const,page:snapshot.page as GroupedBoardPage})} users={users} tags={workspace.state.catalog.tags} loading={snapshot.loading||snapshot.loadingMore} disabled={!workspace.ready} error={snapshot.error?t('productivityKanban.failed'):''} onOpen={id=>void workspace.open(id)} onReload={()=>void controller.refresh()} onLoadMore={()=>void controller.more()}/>)}
 </section>;
}
