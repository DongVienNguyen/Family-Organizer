import type {QueryClock,TaskRecord,TaskSort} from '../../src/features/productivity/contracts.js';
import {timezoneFormatter,utcInstant,localDateAt} from '../../src/features/productivity/dates.js';
import {choice} from '../../src/features/productivity/validation.js';
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const priorities={high:0,medium:1,low:2,none:3};
/** Ordering only, over already-authorized canonical Tasks. All-day dates retain
 * their literal calendar date; timed deadlines use the captured view timezone.
 * All-day precedes timed on the same display day, and no-date is always last.
 * Non-custom ties use canonical ID, never a mutable/manual rank. */
export function createBoardTaskComparator(sort:TaskSort,clock:QueryClock){
 choice(sort,['rank','due','priority','title']);timezoneFormatter(clock.timezone);utcInstant(clock.nowUtc);
 const collator=new Intl.Collator('vi-VN',{usage:'sort',sensitivity:'base',numeric:true});
 const dates=new WeakMap<TaskRecord,{date:string|null;instant:number|null}>();
 const due=(task:TaskRecord)=>{let value=dates.get(task);if(!value){value=task.due.kind==='none'?{date:null,instant:null}:task.due.kind==='all_day'?{date:task.due.date,instant:null}:{date:localDateAt(utcInstant(task.due.instantUtc),clock.timezone),instant:utcInstant(task.due.instantUtc)};dates.set(task,value);}return value;};
 return (a:TaskRecord,b:TaskRecord,aRank:number,bRank:number):number=>{
  let order=0;
  if(sort==='rank')order=aRank-bRank;
  else if(sort==='priority')order=priorities[a.priority]-priorities[b.priority];
  else if(sort==='title')order=collator.compare(a.title.normalize('NFC'),b.title.normalize('NFC'));
  else{const x=due(a),y=due(b);order=x.date===y.date?(x.instant===y.instant?0:x.instant===null?-1:y.instant===null?1:x.instant-y.instant):x.date===null?1:y.date===null?-1:compare(x.date,y.date);}
  return order||compare(a.id,b.id);
 };
}
