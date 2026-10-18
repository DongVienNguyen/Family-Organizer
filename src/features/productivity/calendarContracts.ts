import type {Due,QueryClock,TaskFilter,TaskPatch,TaskRecord} from './contracts.js';
import {calendarDate,assertTimezone,utcInstant} from './dates.js';
import {object,keys,text} from './validation.js';
export interface CalendarRange {fromDate:string;toDateExclusive:string;timezone:string}
export interface CalendarItem {id:string;kind:'task'|'familyPlan'|'virtualOccurrence';sourceId:string;title:string;allDay:boolean;startDate:string;endDateExclusive:string;startUtc:string|null;endUtc:string|null;due:Due|null;revision:number|null;readOnly:boolean;seriesId?:string;seriesRevision?:number;ordinal?:number;requiresTimeResolution?:boolean}
export interface CalendarPage {range:CalendarRange;clock:QueryClock;items:CalendarItem[];total:number;issues:{sourceId:string;code:'invalid-legacy-time'}[]}
export interface CalendarPreview {id:string;taskId:string;taskRevision:number;expiresAt:string;patch:TaskPatch;before:TaskRecord;after:TaskRecord;needsDueConfirmation:boolean;series?:{id:string;revision:number;ordinal:number}}
export interface RescheduleInput {taskId:string;startUtc:string|null;endUtc:string|null;due?:Due}
export interface CalendarApply {taskId:string;previewId:string;confirmedDue?:boolean}
export function calendarRange(raw:unknown):CalendarRange {const value=object(raw);keys(value,['fromDate','toDateExclusive','timezone']);text(value.fromDate,10);text(value.toDateExclusive,10);text(value.timezone,128);const days=(calendarDate(value.toDateExclusive)-calendarDate(value.fromDate))/86400000;if(days<=0||days>366)throw Error('Calendar range must be1–366days');assertTimezone(value.timezone);return {fromDate:value.fromDate,toDateExclusive:value.toDateExclusive,timezone:value.timezone};}
export function calendarClock(clock:QueryClock):void {utcInstant(clock.nowUtc);assertTimezone(clock.timezone);}
export type CalendarFilter=TaskFilter;
