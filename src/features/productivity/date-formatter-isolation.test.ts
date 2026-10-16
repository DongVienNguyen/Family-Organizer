import {expect,it} from 'vitest';
import {localDateAt,localDayStart,timezoneFormatter} from './dates.js';
it('does not let a caller-owned formatter alter current or later date calculations',()=>{
 const instant=Date.UTC(2027,0,1,18),expected=localDateAt(instant,'Asia/Saigon');expect(expected).toBe('2027-01-02');
 const exposed=timezoneFormatter('Asia/Saigon');exposed.formatToParts=()=>[{type:'year',value:'1999'},{type:'month',value:'01'},{type:'day',value:'01'}];
 expect(exposed.formatToParts(new Date(instant))[0].value).toBe('1999');expect(localDateAt(instant,'Asia/Saigon')).toBe(expected);expect(localDayStart('2027-01-02','Asia/Saigon')).toBe(Date.UTC(2027,0,1,17));
 expect(timezoneFormatter('Asia/Saigon').formatToParts(new Date(instant)).find(p=>p.type==='year')?.value).toBe('2027');
});
it('keeps zones isolated across repeated conversions and rejects malformed names after warm valid reads',()=>{
 const instant=Date.UTC(2027,0,1,1);
 for(let i=0;i<5;i++){expect(localDateAt(instant,'America/New_York')).toBe('2026-12-31');expect(localDateAt(instant,'Asia/Saigon')).toBe('2027-01-01');expect(localDateAt(instant,'UTC')).toBe('2027-01-01');}
 for(const bad of ['+00:00','-05:00','not-a-zone',''])expect(()=>localDateAt(instant,bad)).toThrow();
 expect(()=>localDateAt(NaN,'UTC')).toThrow();
});
