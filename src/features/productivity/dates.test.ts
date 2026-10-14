import {describe,it,expect,vi} from 'vitest';
import {resolveDue,parseLegacyDue,assertDue,dueInstant,utcInstant} from './dates.js';
import type {Due} from './contracts.js';
const zone='Asia/Saigon';
const clock=(nowUtc:string,timezone=zone)=>({nowUtc,timezone});
describe('P01 deadline clock',()=>{
 it('all_day_local_midnight expires at next Saigon midnight, not UTC midnight',()=>{
  const due:Due={kind:'all_day',date:'2026-10-11',timezone:zone};
  expect(resolveDue(due,clock('2026-10-11T00:00:00Z'))).toEqual({overdue:false,localDate:'2026-10-11'});
  expect(resolveDue(due,clock('2026-10-11T16:59:59.999Z')).overdue).toBe(false);
  expect(resolveDue(due,clock('2026-10-11T17:00:00Z')).overdue).toBe(true);
 });
 it('none never becomes overdue',()=>expect(resolveDue({kind:'none'},clock('2026-10-15T00:00:00Z'))).toEqual({overdue:false,localDate:null}));
 it('timed deadline is reached at the explicit UTC instant',()=>{
  const due:Due={kind:'timed',instantUtc:'2026-10-11T17:00:00Z',timezone:zone};
  expect(resolveDue(due,clock('2026-10-11T16:59:59Z')).overdue).toBe(false);
  expect(resolveDue(due,clock('2026-10-11T17:00:00Z'))).toEqual({overdue:true,localDate:'2026-10-12'});
 });
 it.each([
  ['2026-03-08','2026-03-08T05:00:00Z','2026-03-09T04:00:00Z'],
  ['2026-11-01','2026-11-01T04:00:00Z','2026-11-02T05:00:00Z'],
 ])('handles a New York DST day %s without fixed 24-hour arithmetic',(date,start,end)=>{
  const due:Due={kind:'all_day',date,timezone:'America/New_York'};
  expect(dueInstant(due)).toBe(utcInstant(start));
  expect(resolveDue(due,clock(new Date(utcInstant(end)-1).toISOString())).overdue).toBe(false);
  expect(resolveDue(due,clock(end)).overdue).toBe(true);
 });
 it('finds the first valid local time when midnight is skipped',()=>expect(dueInstant({kind:'all_day',date:'2018-11-04',timezone:'America/Sao_Paulo'})).toBe(utcInstant('2018-11-04T03:00:00Z')));
 it('rejects a whole skipped local date rather than assigning another day',()=>expect(()=>dueInstant({kind:'all_day',date:'2011-12-30',timezone:'Pacific/Apia'})).toThrow());
 it('uses injected clock and never reads Date.now',()=>{
  const spy=vi.spyOn(Date,'now').mockImplementation(()=>{throw Error('ambient clock');});
  try {expect(resolveDue({kind:'all_day',date:'2026-10-11',timezone:zone},clock('2026-10-11T17:00:00Z')).overdue).toBe(true);} finally {spy.mockRestore();}
 });
 it.each(['2026-02-30','2026-13-01','26-10-11','2026-2-01'])('rejects invalid all-day date %s',date=>expect(()=>assertDue({kind:'all_day',date,timezone:zone})).toThrow());
 it.each(['2026-02-30T00:00:00Z','2026-10-11T24:00:00Z','2026-10-11T00:00:00','2026-10-11T00:00:00+07:00','2026-10-11'])('rejects invalid or non-UTC instant %s',raw=>expect(()=>utcInstant(raw)).toThrow());
 it('rejects malformed timezone in due and clock even for no deadline',()=>{
  expect(()=>assertDue({kind:'all_day',date:'2026-10-11',timezone:'Mars/Olympus'})).toThrow();
  expect(()=>resolveDue({kind:'none'},clock('2026-10-11T00:00:00Z','Mars/Olympus'))).toThrow();
 });
 it('rejects cross-kind deadline fields',()=>expect(()=>assertDue({kind:'none',date:'2026-10-11'})).toThrow());
});
describe('P01 legacy parsing report',()=>{
 it('preserves date semantics and records explicit timezone assumption',()=>{
  const result=parseLegacyDue('2026-10-11',zone);
  expect(result.due).toEqual({kind:'all_day',date:'2026-10-11',timezone:zone});
  expect(result.warnings.join(' ')).toContain('2026-10-11');expect(result.warnings.join(' ')).toContain(zone);
 });
 it.each(['01/02','2026-02-30','2026-11-01T01:30:00','2026-03-08 02:30','bad date'])('legacy_ambiguous_date preserves rejected raw %s',raw=>{
  const result=parseLegacyDue(raw,'America/New_York');
  expect(result.due).toEqual({kind:'none'});expect(result.warnings.join(' ')).toContain(raw);
 });
 it('normalizes an explicit offset without host-local parsing',()=>expect(parseLegacyDue('2026-10-11T09:30:00+07:00',zone)).toEqual({due:{kind:'timed',instantUtc:'2026-10-11T02:30:00.000Z',timezone:zone},warnings:[]}));
 it('accepts leap day and UTC instants',()=>{
  expect(parseLegacyDue('2024-02-29',zone).due.kind).toBe('all_day');
  expect(parseLegacyDue('2026-10-11T00:00:00Z',zone).due.kind).toBe('timed');
 });
 it('an empty legacy deadline has no warning or fabricated date',()=>expect(parseLegacyDue('',zone)).toEqual({due:{kind:'none'},warnings:[]}));
});
