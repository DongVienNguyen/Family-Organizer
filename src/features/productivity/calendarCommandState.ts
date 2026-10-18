import {createDraftCommandState} from './draftCommandState.js';
import type {TaskApi} from './api.js';
import type {CalendarPreview} from './calendarContracts.js';
import {assertTimezone} from './dates.js';
import {integer,text,boolean} from './validation.js';
export interface CalendarDraft {preview:CalendarPreview;confirmedDue:boolean;timezone?:string}
/** Owned by TaskProvider so an unknown result survives view navigation, but
 * never logout or a fresh authoritative visibility denial. No device storage. */
export function createCalendarCommandState(ports:{api:Pick<TaskApi,'applyCalendar'>;onCommitted():Promise<void>;newRequestId?:()=>string}){return createDraftCommandState<CalendarDraft,Awaited<ReturnType<TaskApi['applyCalendar']>>>({validate:draft=>{integer(draft.preview.taskRevision,1);text(draft.preview.id,256);text(draft.preview.taskId,256);boolean(draft.confirmedDue);if(draft.timezone!==undefined)assertTimezone(draft.timezone);if(draft.preview.needsDueConfirmation&&!draft.confirmedDue)throw Error('Deadline confirmation required');},send:(draft,key)=>ports.api.applyCalendar(draft.preview.taskRevision,{taskId:draft.preview.taskId,previewId:draft.preview.id,confirmedDue:draft.confirmedDue},key),onCommitted:()=>ports.onCommitted(),newRequestId:ports.newRequestId});}
export type CalendarCommandState=ReturnType<typeof createCalendarCommandState>;
