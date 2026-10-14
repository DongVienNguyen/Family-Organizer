import {it,expect} from 'vitest';
import {resolvePeriod,effectiveDateAt,parseEffectiveDate} from './dates.js';
it('period boundaries use Gregorian leap years, Monday weeks and halfopen local dates',()=>{
 expect(resolvePeriod({kind:'month',anchorDate:'2028-02-12'},'Asia/Saigon')).toEqual({fromDate:'2028-02-01',toDateExclusive:'2028-03-01',timezone:'Asia/Saigon'});
 expect(resolvePeriod({kind:'week',anchorDate:'2026-10-11'},'Asia/Saigon').fromDate).toBe('2026-10-05');
 expect(resolvePeriod({kind:'year',anchorDate:'2028-12-31'},'UTC').toDateExclusive).toBe('2029-01-01');
 expect(resolvePeriod({kind:'custom',anchorDate:'2028-02-12',fromDate:'2028-02-29',toDateExclusive:'2028-03-01'},'UTC').fromDate).toBe('2028-02-29');
});
it('effective dates use explicit timezone and import formats reject ambiguous inputs',()=>{
 expect(effectiveDateAt('2026-10-10T23:30:00Z','Asia/Saigon')).toBe('2026-10-11');
 expect(effectiveDateAt('2026-10-10T23:30:00Z','America/Los_Angeles')).toBe('2026-10-10');
 expect(()=>parseEffectiveDate('01/02')).toThrow();expect(()=>parseEffectiveDate('01/02/2028')).toThrow();
 expect(parseEffectiveDate('01/02/2028','DD/MM/YYYY')).toBe('2028-02-01');expect(parseEffectiveDate('01/02/2028','MM/DD/YYYY')).toBe('2028-01-02');
 expect(()=>parseEffectiveDate('29/02/2027','DD/MM/YYYY')).toThrow();
});
it('invalid named zones, host local timestamps, malformed periods and years outside ISO bounds refuse',()=>{
 expect(()=>effectiveDateAt('2026-10-10 23:30','UTC')).toThrow();expect(()=>resolvePeriod({kind:'month',anchorDate:'2027-02-29'},'UTC')).toThrow();
 expect(()=>resolvePeriod({kind:'month',anchorDate:'2028-02-01'},'unknown')).toThrow();
 expect(()=>resolvePeriod({kind:'custom',anchorDate:'2028-02-01',fromDate:'2028-02-02',toDateExclusive:'2028-02-01'},'UTC')).toThrow();
 expect(()=>resolvePeriod({kind:'year',anchorDate:'9999-12-31'},'UTC')).toThrow();
});
