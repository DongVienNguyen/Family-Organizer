import{expect,it}from'vitest';
import{registerProductivityCore,registerProductivityAdvanced,registerProductivityChromium,registerProductivityCoreWithWorkflow}from'./e2e/productivity-cases.js';
import{productivityBrowserCases}from'../scripts/ci/productivity-browser-contract.mjs';
function names(register:typeof registerProductivityCore){const cases:string[]=[];register(((name:string)=>{cases.push(name);})as any);return cases;}
it('registers every original Chromium scenario once in the accepted shared-store order',()=>{expect(names(registerProductivityChromium)).toEqual(productivityBrowserCases);expect(new Set(names(registerProductivityChromium)).size).toBe(productivityBrowserCases.length);});
it('keeps independent Firefox/WebKit files complete and disjoint at the C15 boundary',()=>{const core=names(registerProductivityCore),advanced=names(registerProductivityAdvanced);expect(core).toEqual(productivityBrowserCases.slice(0,15));expect(advanced).toEqual(productivityBrowserCases.slice(15,35));expect(core.filter(name=>advanced.includes(name))).toEqual([]);});

it('keeps supplemental workflow scenarios on the lighter core worker without changing Chromium order',()=>{const core=names(registerProductivityCoreWithWorkflow);expect(core).toEqual([...productivityBrowserCases.slice(0,15),...productivityBrowserCases.slice(35)]);expect(new Set([...core,...names(registerProductivityAdvanced)])).toEqual(new Set(productivityBrowserCases));});
