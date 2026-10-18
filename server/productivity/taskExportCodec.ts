import {AppStoreError} from '../appErrors.js';
import {maxImportBytes} from '../wallet/parsers/common.js';
import type {TaskRecord} from '../../src/features/productivity/contracts.js';
import {assertTaskRecord} from '../../src/features/productivity/contracts.js';
import {utcInstant,calendarDate} from '../../src/features/productivity/dates.js';
import {choice} from '../../src/features/productivity/validation.js';
import {assertImportTree,parseTaskImport,taskImportCsvColumns,type TaskImportFormat} from './taskImportParser.js';
export interface PortableTask extends TaskRecord {checklist:{id:string;text:string;done:boolean}[];legacy?:unknown;sourceFacts?:unknown}
const csvCell=(value:string)=>'"'+value.replaceAll('"','""')+'"',dangerous=(value:string)=>/^[\s\u0000-\u001f]*[=+\-@]/u.test(value),escapeIcs=(value:string)=>value.replaceAll('\\','\\\\').replace(/\r\n|\r|\n/g,'\\n').replaceAll(';','\\;').replaceAll(',','\\,'),icsInstant=(value:string)=>new Date(utcInstant(value)).toISOString().replaceAll('-','').replaceAll(':','').replace(/\.\d{3}Z$/,'Z'),icsDate=(value:string)=>{calendarDate(value);return value.replaceAll('-','');};
function foldIcs(value:string):string {let part='',out='',bytes=0;for(const char of value){const size=Buffer.byteLength(char);if(bytes+size>75){out+=part+'\r\n';part=' ';bytes=1;}part+=char;bytes+=size;}return out+part;}
/** Pure codec: its caller must resolve selection and current authorization.
 * JSON is the lossless portable text format. CSV has explicit reversible escape
 * metadata; ordinary CSV imports never remove an apostrophe heuristically. */
export function encodeTaskExport(rows:PortableTask[],format:TaskImportFormat,exportedAt:string):Buffer {
 choice(format,['json','csv','ics']);utcInstant(exportedAt);for(const row of rows)assertTaskRecord(row);
 const json=JSON.stringify({format:'family-organizer.tasks',version:1,exportedAt,tasks:rows});if(Buffer.byteLength(json)>maxImportBytes)throw new AppStoreError('Nội dung xuất vượt20MiB; hãy thu hẹp vùng chọn.',413,'LIMIT_EXCEEDED');
 // Require a closed selected tree. No parent ID is dropped or invented to make
 // a file appear importable; the UI can export a complete visible list instead.
 assertImportTree(parseTaskImport(Buffer.from(json),'json').rows);
 let value:string;
 if(format==='json')value=json;
 else if(format==='csv'){const lines=[taskImportCsvColumns.map(csvCell).join(',')];for(const row of rows){const values:Record<string,string>={id:row.id,parentId:row.parentId??'',listId:row.listId,title:row.title,body:row.body,priority:row.priority,due:JSON.stringify(row.due),scheduledStart:row.scheduledStart??'',scheduledEnd:row.scheduledEnd??'',checklist:JSON.stringify(row.checklist),textEncoding:'family-organizer.spreadsheet-prefix-v1',escapedColumns:'[]'},escaped:string[]=[];for(const key of taskImportCsvColumns)if(!['due','checklist','textEncoding','escapedColumns'].includes(key)&&dangerous(values[key])){values[key]="'"+values[key];escaped.push(key);}values.escapedColumns=JSON.stringify(escaped);if(Object.values(values).some(value=>value.length>100000))throw new AppStoreError('Ô CSV vượt100.000 ký tự; hãy chọn JSON để giữ đầy đủ nội dung.',413,'LIMIT_EXCEEDED');lines.push(taskImportCsvColumns.map(key=>csvCell(values[key])).join(','));}value='\ufeff'+lines.join('\r\n')+'\r\n';}
 else {const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Family Organizer//Private Task Export//EN','CALSCALE:GREGORIAN','X-WR-CALDESC:JSON preserves full history; this ICS contains Task dates and text only.'];for(const row of rows){lines.push('BEGIN:VTODO','UID:'+escapeIcs(row.id),'DTSTAMP:'+icsInstant(exportedAt),'SUMMARY:'+escapeIcs(row.title),'DESCRIPTION:'+escapeIcs(row.body),'PRIORITY:'+({high:1,medium:5,low:9,none:0}[row.priority]),'X-FAMILY-LIST-ID:'+escapeIcs(row.listId));if(row.parentId)lines.push('RELATED-TO:'+escapeIcs(row.parentId));if(row.due.kind==='all_day')lines.push('DUE;VALUE=DATE:'+icsDate(row.due.date));else if(row.due.kind==='timed')lines.push('DUE:'+icsInstant(row.due.instantUtc));if(row.scheduledStart!==null&&row.scheduledEnd!==null)lines.push('DTSTART:'+icsInstant(row.scheduledStart),'DTEND:'+icsInstant(row.scheduledEnd));lines.push('END:VTODO');}lines.push('END:VCALENDAR');value=lines.map(foldIcs).join('\r\n')+'\r\n';}
 const bytes=Buffer.from(value,'utf8');if(bytes.length>maxImportBytes)throw new AppStoreError('Tệp xuất vượt20MiB; hãy thu hẹp vùng chọn.',413,'LIMIT_EXCEEDED');return bytes;
}
