import {it,expect} from 'vitest';
import {calendarLocalTime} from './calendarLocalTime.js';
it('normal wall time resolves using the named zone independently of host timezone',()=>{expect(calendarLocalTime('2026-10-11T10:30','Asia/Saigon')).toEqual({kind:'unique',options:['2026-10-11T03:30:00.000Z']});});
it('DST fold exposes both real instants for explicit choice',()=>{expect(calendarLocalTime('2026-11-01T01:30','America/New_York')).toEqual({kind:'choice',options:['2026-11-01T05:30:00.000Z','2026-11-01T06:30:00.000Z']});});
it('DST gap cannot silently become another hour',()=>{expect(calendarLocalTime('2026-03-08T02:30','America/New_York')).toEqual({kind:'gap',options:[]});});
it('half-hour DST fold retains both choices rather than assuming a one-hour transition',()=>{expect(calendarLocalTime('2026-04-05T01:45','Australia/Lord_Howe')).toEqual({kind:'choice',options:['2026-04-04T14:45:00.000Z','2026-04-04T15:15:00.000Z']});});
it.each(['2026-02-30T10:00','2026-10-11T24:00','2026-10-11','2026-10-11T10:30Z'])('rejects invalid or already-zoned wall input %s',value=>{expect(()=>calendarLocalTime(value,'Asia/Saigon')).toThrow();});
