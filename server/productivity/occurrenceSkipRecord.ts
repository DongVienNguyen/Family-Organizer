import {keys,object,text,integer} from '../../src/features/productivity/validation.js';
import {utcInstant} from '../../src/features/productivity/dates.js';
export interface OccurrenceSkip {seriesId:string;ordinal:number;taskId:string;skippedAt:string;skippedById:string;taskRevision:number}
/** Explicit skip decision only: no accepted timestamp, reward or rotation fact. */
export function decodeOccurrenceSkip(row:Record<string,unknown>):OccurrenceSkip {
 try{keys(object(row),['series_id','ordinal','task_id','skipped_at','skipped_by_id','task_revision']);text(row.series_id,256);text(row.task_id,256);text(row.skipped_by_id,256);integer(row.ordinal,0,100000);integer(row.task_revision,1);utcInstant(row.skipped_at as string);return {seriesId:row.series_id as string,ordinal:row.ordinal as number,taskId:row.task_id as string,skippedAt:row.skipped_at as string,skippedById:row.skipped_by_id as string,taskRevision:row.task_revision as number};}
 catch{throw Error('Invalid occurrence skip');}
}
