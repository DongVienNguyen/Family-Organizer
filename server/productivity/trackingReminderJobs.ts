import type {AppJobs} from '../appJobs.js';import type {AppJobLease} from '../jobStore.js';import type {createTrackingReminders,TrackingScanWork} from './trackingReminders.js';
export function registerTrackingReminderJobs(jobs:AppJobs,engine:ReturnType<typeof createTrackingReminders>,events:{notificationChanged?(ownerId:string):void}={}):void {
 if(!jobs.durableEnabled)return;
 const lease=(value:AppJobLease|undefined)=>{if(!value)throw Error('Durable tracking reminder lease required');return value;};
 jobs.registerAppJob('productivity','tracking-reminder-scan',(signal,job)=>{engine.run(lease(job)as TrackingScanWork,signal,events);});
 jobs.registerAppJob('productivity','tracking-reminder-tick',(signal,job)=>{const value=lease(job),separator=value.key.lastIndexOf(':'),tick=Number(value.key.slice(separator+1));if(separator<1||!Number.isSafeInteger(tick)||tick<0)throw Error('Invalid tracking reminder tick identity');engine.run({id:value.id,payload:{epoch:value.key.slice(0,separator),tick,afterRuleId:null,scanDone:false}},signal,events);},{everyMs:60000,initialMs:1000,kind:'command',occurrenceKey:now=>engine.enabled()?engine.epoch()+':'+Math.floor(now.getTime()/60000):undefined});
}
