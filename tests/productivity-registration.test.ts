import{expect,it}from'vitest';
import{registerProductivityCore,registerProductivityAdvanced,registerProductivityChromium}from'./e2e/productivity-cases.js';
import{productivityBrowserCases}from'../scripts/ci/productivity-browser-contract.mjs';
function names(register:typeof registerProductivityCore){const cases:string[]=[];register(((name:string)=>{cases.push(name);})as any);return cases;}
it('registers every original Chromium scenario once in the accepted shared-store order',()=>{expect(names(registerProductivityChromium)).toEqual(productivityBrowserCases);expect(new Set(names(registerProductivityChromium)).size).toBe(productivityBrowserCases.length);});
it('keeps independent Firefox/WebKit files complete and disjoint at the C15 boundary',()=>{const core=names(registerProductivityCore),advanced=names(registerProductivityAdvanced);expect(core).toEqual(productivityBrowserCases.slice(0,15));expect(advanced).toEqual(productivityBrowserCases.slice(15));expect(core.filter(name=>advanced.includes(name))).toEqual([]);});
