import {trackingProjection} from './linkedMoney.js';
import {it,expect} from 'vitest';
import {addTrackingAmount,subtractTrackingAmount,compareTrackingAmount,trackingPercent,formatTrackingAmount,outsideBookSavings} from './linkedMoney.js';
const m=(minor:string)=>({minor,currency:'VND'});
it('preserves existing numeric legacy arithmetic while keeping new exact amounts above Number precision',()=>{
 expect(addTrackingAmount(1.5,2.25)).toBe(3.75);expect(subtractTrackingAmount(10,3)).toBe(7);
 expect(addTrackingAmount(m('9007199254740993'),1)).toEqual(m('9007199254740994'));expect(subtractTrackingAmount(m('9007199254740993'),m('9007199254740992'))).toEqual(m('1'));
 expect(compareTrackingAmount(m('9007199254740993'),m('9007199254740992'))).toBe(1);expect(formatTrackingAmount(m('9007199254740993'),'vi-VN')).toBe('9.007.199.254.740.993');
});
it('only converts a bounded ratio to Number for the progress bar and handles empty or overfunded targets',()=>{
 expect(trackingPercent(m('9007199254740993'),m('9007199254740994'))).toBe(100);expect(trackingPercent(m('1'),m('3'))).toBe(33);expect(trackingPercent(m('4'),m('3'))).toBe(100);expect(trackingPercent(m('-1'),m('3'))).toBe(0);expect(trackingPercent(0,0)).toBe(0);
});
it('rejects ambiguous fractional/unsafe legacy conversion and cross-currency sums instead of rounding money',()=>{
 expect(()=>addTrackingAmount(m('1'),1.5)).toThrow();expect(()=>addTrackingAmount(m('1'),9007199254740992)).toThrow();expect(()=>addTrackingAmount(m('1'),{minor:'1',currency:'USD'})).toThrow();expect(()=>addTrackingAmount(m('9223372036854775807'),1)).toThrow();
});
it('a linked allocation or transfer contribution cannot inflate the old outside-book savings jar',()=>{
 const goals=[{contributions:[{amount:500},{amount:m('100000'),walletLinkId:'synthetic-allocation'},{amount:m('200000'),walletLinkId:'synthetic-transfer'}]}];expect(outsideBookSavings(goals)).toBe(500);
});

it('keeps unsupported mixed legacy fractions and signed64 overflow as reconciliation states, never zero totals',()=>{
 expect(trackingProjection(()=>addTrackingAmount(0.5,{minor:'1',currency:'VND'}))).toBeNull();
 expect(trackingProjection(()=>addTrackingAmount({minor:'9223372036854775807',currency:'VND'},{minor:'1',currency:'VND'}))).toBeNull();
 expect(trackingProjection(()=>addTrackingAmount(100,{minor:'9007199254740993',currency:'VND'}))).toEqual({minor:'9007199254741093',currency:'VND'});
 expect(trackingProjection(()=>addTrackingAmount(0.1,0.2))).toBe(0.1+0.2);
});
