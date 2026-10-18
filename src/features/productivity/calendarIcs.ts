import type {CalendarPage} from './calendarContracts.js';
import {calendarDate,utcInstant} from './dates.js';
const escape=(value:string)=>value.replaceAll('\\','\\\\').replace(/\r\n|\r|\n/g,'\\n').replaceAll(';','\\;').replaceAll(',','\\,');
const date=(value:string)=>{calendarDate(value);return value.replaceAll('-','');};
const instant=(value:string)=>new Date(utcInstant(value)).toISOString().replaceAll('-','').replaceAll(':','').replace(/\.\d{3}Z$/,'Z');
/** RFC5545 folds by UTF8 octets without splitting a code point. Subsequent
 * lines reserve one octet for the continuation space. */
function fold(line:string):string {let result='',part='',bytes=0;for(const point of line){const size=new TextEncoder().encode(point).length;if(bytes+size>75){result+=part+'\r\n';part=' ';bytes=1;}part+=point;bytes+=size;}return result+part;}
/** Authenticated visible-window download. Virtual slots remain tentative
 * projections; no RRULE/feed credentials or notification recipients are added. */
export function calendarIcs(page:CalendarPage):string {
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Family Organizer//Visible Calendar//EN','CALSCALE:GREGORIAN','X-FAMILY-EXPORT-SCOPE:VISIBLE-WINDOW','X-WR-CALDESC:'+escape(page.range.fromDate+' / '+page.range.toDateExclusive+'; '+page.range.timezone+'; future occurrences are projections')];
 for(const item of page.items){if(item.requiresTimeResolution)continue;lines.push('BEGIN:VEVENT','UID:'+escape(item.id)+'@family-organizer.local','DTSTAMP:'+instant(page.clock.nowUtc),'SUMMARY:'+escape(item.title));if(item.allDay)lines.push('DTSTART;VALUE=DATE:'+date(item.startDate),'DTEND;VALUE=DATE:'+date(item.endDateExclusive));else if(item.startUtc){lines.push('DTSTART:'+instant(item.startUtc));if(item.endUtc)lines.push('DTEND:'+instant(item.endUtc));}else continue;if(item.kind==='virtualOccurrence')lines.push('STATUS:TENTATIVE','X-FAMILY-VIRTUAL-OCCURRENCE:TRUE');lines.push('END:VEVENT');}
 lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
