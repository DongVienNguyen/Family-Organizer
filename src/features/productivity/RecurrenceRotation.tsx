import React from 'react';
import {useTranslation} from 'react-i18next';
import {UserRole,type User} from '../../types.js';
import {moveRotationMember} from './recurrenceRoster.js';

/** Ordered selection controls; the caller owns the unsaved draft and save. */
export function RecurrenceRotation({users,members,disabled,onChange}:{users:User[];members:readonly string[];disabled:boolean;onChange:(members:string[])=>void}){
 const {t}=useTranslation(),eligible=users.filter(user=>!user.isDeleted&&Object.values(UserRole).includes(user.role));
 const buttonClass='neu-btn rounded-xl px-3 min-h-11 text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-40';
 return <fieldset disabled={disabled} className="space-y-2 min-w-0"><legend className="text-xs text-slate-400">{t('recurrence.rotation')}</legend><button type="button" className="text-xs text-sky-400" onClick={()=>onChange([])}>{t('recurrence.noRotation')}</button>
  <div className="flex flex-wrap gap-3">{eligible.map(user=><label key={user.id} className="inline-flex items-center gap-2 text-sm text-slate-300 break-words"><input type="checkbox" checked={members.includes(user.id)} onChange={event=>onChange(event.target.checked?[...members,user.id]:members.filter(id=>id!==user.id))}/>{user.fullName}</label>)}</div>
  {members.length>0&&<ol aria-label={t('recurrence.rotationOrder')} className="space-y-2">{members.map((id,index)=>{const name=eligible.find(user=>user.id===id)?.fullName??t('recurrence.rotationUnavailable');return <li key={id} className="neu-flat rounded-xl p-2 space-y-2 min-w-0"><span className="block text-sm text-slate-200 break-words">{index+1}. {name}</span><div className="flex flex-wrap gap-2">
   <button type="button" className={buttonClass} aria-label={t('recurrence.rotationEarlier',{name})} disabled={index===0} onClick={()=>onChange(moveRotationMember(members,id,-1))}>↑</button>
   <button type="button" className={buttonClass} aria-label={t('recurrence.rotationLater',{name})} disabled={index===members.length-1} onClick={()=>onChange(moveRotationMember(members,id,1))}>↓</button>
   <button type="button" className={buttonClass} aria-label={t('recurrence.rotationRemove',{name})} onClick={()=>onChange(members.filter(member=>member!==id))}>×</button>
  </div></li>;})}</ol>}
 </fieldset>;
}
