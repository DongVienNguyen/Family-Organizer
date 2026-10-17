import{expect,it}from'vitest';
import{registerProductivityCore,registerProductivityAdvanced,registerProductivityChromium,registerProductivityCoreWithSupplemental,registerProductivityColumns,registerProductivityRoster,registerProductivityPolicy}from'./e2e/productivity-cases.js';
import{productivityBrowserCases}from'../scripts/ci/productivity-browser-contract.mjs';
function names(register:typeof registerProductivityCore){const cases:string[]=[];register(((name:string)=>{cases.push(name);})as any);return cases;}
it('registers every original Chromium scenario once in the accepted shared-store order',()=>{expect(names(registerProductivityChromium)).toEqual(productivityBrowserCases);expect(new Set(names(registerProductivityChromium)).size).toBe(productivityBrowserCases.length);});
it('keeps independent Firefox/WebKit files complete and disjoint at the C15 boundary',()=>{const core=names(registerProductivityCore),advanced=names(registerProductivityAdvanced);expect(core).toEqual(productivityBrowserCases.slice(0,15));expect(advanced).toEqual(productivityBrowserCases.slice(15,35));expect(core.filter(name=>advanced.includes(name))).toEqual([]);});

it('keeps supplemental workflow scenarios on the lighter core worker without changing Chromium order',()=>{const core=names(registerProductivityCoreWithSupplemental);expect(core).toEqual([...productivityBrowserCases.slice(0,15),...productivityBrowserCases.slice(35)]);expect(new Set([...core,...names(registerProductivityAdvanced)])).toEqual(new Set(productivityBrowserCases));});

it('preserves the original39scenario order before all three column settings cases',()=>{const all=names(registerProductivityChromium),columns=names(registerProductivityColumns);expect(columns).toEqual(productivityBrowserCases.slice(39,42));expect(all.slice(0,39)).toEqual(productivityBrowserCases.slice(0,39));expect(all.slice(39,42)).toEqual(columns);});
it('appends the real ordered roster journey without omitting any previous case',()=>{expect(names(registerProductivityRoster)).toEqual(productivityBrowserCases.slice(42,43));expect(names(registerProductivityChromium).slice(0,42)).toEqual(productivityBrowserCases.slice(0,42));});

it('appends the real shared WIP policy journey after every earlier scenario',()=>{expect(names(registerProductivityPolicy)).toEqual(productivityBrowserCases.slice(43));});
