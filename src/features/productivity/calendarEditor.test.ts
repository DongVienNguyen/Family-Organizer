import {it,expect} from 'vitest';
import {calendarEditor} from './CalendarDialog.js';
import type {CalendarItem} from './calendarContracts.js';
const item={id:'task:synthetic',kind:'task',sourceId:'synthetic',title:'Synthetic overnight timebox',allDay:false,startDate:'2026-10-11',endDateExclusive:'2026-10-13',startUtc:'2026-10-11T15:00:00.000Z',endUtc:'2026-10-11T20:00:00.000Z',due:{kind:'all_day',date:'2026-10-15',timezone:'Asia/Saigon'},revision:1,readOnly:false}as CalendarItem;
it('dragging an overnight timebox preserves both local dates and the independent deadline offset in the draft',()=>{const draft=calendarEditor(item,'Asia/Saigon','2026-10-13');expect(draft.start).toBe('2026-10-13 22:00');expect(draft.end).toBe('2026-10-14 03:00');expect(draft.dueDate).toBe('2026-10-17');expect(draft.due).toEqual(item.due);});
it('a timed virtual deadline keeps its source timezone when the viewing date differs',()=>{const draft=calendarEditor({...item,kind:'virtualOccurrence',startDate:'2026-10-10',due:{kind:'timed',instantUtc:'2026-10-11T01:00:00.000Z',timezone:'Asia/Saigon'}},'America/Los_Angeles');expect(draft.dueLocal).toBe('2026-10-11 08:00');});
