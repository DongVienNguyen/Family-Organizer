import {it,expect} from 'vitest';
import {parseMoney,formatMoney,addMoney,convertMoney,assertMoney} from './money.js';
it('VND integer and USD cents add without binary floating point',()=>{
 expect(parseMoney('150000','VND','vi-VN')).toEqual({minor:'150000',currency:'VND'});
 expect(parseMoney('12.34','USD','en-US').minor).toBe('1234');
 expect(addMoney(parseMoney('0.1','USD','en-US'),parseMoney('0.2','USD','en-US')).minor).toBe('30');
 expect(()=>addMoney({minor:'1',currency:'VND'},{minor:'1',currency:'USD'})).toThrow();
});
it('locale grammar rejects ambiguous separators, malformed groups and fractional VND',()=>{
 expect(parseMoney('1.234,56','USD','vi-VN').minor).toBe('123456');expect(parseMoney('1,234.56','USD','en-US').minor).toBe('123456');
 for(const [text,currency,locale] of [['1.2','VND','en-US'],['12.345','USD','en-US'],['1.234,56','USD','en-US'],['12,34.56','USD','en-US'],['1e3','USD','en-US'],['-1','VND','vi-VN'],['NaN','USD','en-US'],['Infinity','USD','en-US'],['','USD','en-US']] as const)expect(()=>parseMoney(text,currency,locale)).toThrow();
 expect(()=>parseMoney('1','EUR','en-US')).toThrow();expect(()=>parseMoney('1','USD','unknown')).toThrow();
});
it('signed64 posting bounds are exact and unsigned forms refuse overflow',()=>{
 expect(parseMoney('9223372036854775807','VND','en-US').minor).toBe('9223372036854775807');
 expect(()=>parseMoney('9223372036854775808','VND','en-US')).toThrow();
 expect(()=>addMoney({minor:'9223372036854775807',currency:'VND'},{minor:'1',currency:'VND'})).toThrow();
 expect(()=>assertMoney({minor:'-9223372036854775808',currency:'VND'})).not.toThrow();expect(()=>assertMoney({minor:'-9223372036854775809',currency:'VND'})).toThrow();
 for(const minor of ['01','-0','1.0','1e3','',1])expect(()=>assertMoney({minor,currency:'USD'})).toThrow();
});
it('major-unit rational FX adjusts currency scales and rounds half-up only once',()=>{
 expect(convertMoney({minor:'1234',currency:'USD'},'VND',{numerator:'26000',denominator:'1'})).toEqual({minor:'320840',currency:'VND'});
 expect(convertMoney({minor:'26000',currency:'VND'},'USD',{numerator:'1',denominator:'26000'}).minor).toBe('100');
 expect(convertMoney({minor:'1',currency:'USD'},'USD',{numerator:'1',denominator:'2'}).minor).toBe('1');
 expect(convertMoney({minor:'-1',currency:'USD'},'USD',{numerator:'1',denominator:'2'}).minor).toBe('-1');
 for(const rate of [{numerator:'0',denominator:'1'},{numerator:'1',denominator:'0'},{numerator:'-1',denominator:'1'}])expect(()=>convertMoney({minor:'100',currency:'USD'},'VND',rate)).toThrow();
 expect(()=>convertMoney({minor:'9223372036854775807',currency:'VND'},'USD',{numerator:'100',denominator:'1'})).toThrow();
});
it('formatting retains cents and signed64 values without converting amount to Number',()=>{
 expect(formatMoney({minor:'123456',currency:'USD'},'en-US')).toContain('1,234.56');expect(formatMoney({minor:'-1',currency:'USD'},'en-US')).toContain('-$0.01');
 expect(formatMoney({minor:'9223372036854775807',currency:'VND'},'vi-VN')).toContain('9.223.372.036.854.775.807');
 expect(formatMoney({minor:'123456',currency:'USD'},'vi-VN')).toContain('1.234,56');
});
