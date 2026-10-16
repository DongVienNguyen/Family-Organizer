import {sectionTouchProof}from'./helpers/section-touch-fixture.js';
import fs from'node:fs';
import {expect,it}from'vitest';
import {validateMatrixTouchReports}from'../scripts/ci/matrix-touch-contract.mjs';
import {releaseProductivityBrowserFixture}from'./helpers/release-productivity-browser-fixture.js';
// Synthetic validator packets only, never native Windows qualification.
function check(change:(input:any)=>void){const f=releaseProductivityBrowserFixture({version:13,shards:true});try{const input:any={touch:f.touch,engines:f.value.engines,manifest:f.value.manifest,expected:f.value.expected,kanbanSectionTouchVersion:1};input.touch.runtime.kanbanSectionTouch=sectionTouchProof();change(input);return validateMatrixTouchReports(input);}finally{fs.rmSync(f.root,{recursive:true,force:true});}}
it('requires native touch preview/cancel/no-reward facts in addition to the original Matrix gesture',()=>expect(check(()=>{})).toEqual([]));
it('historical Matrix-only targets remain readable without claiming section touch',()=>expect(check(input=>{delete input.kanbanSectionTouchVersion;delete input.touch.runtime.kanbanSectionTouch;})).toEqual([]));
it.each(['missing','pointer-kind','untrusted','version','viewport','previewNotAutomatic','targetPrefilled','previewReadOnly','cancelNoTaskMutation','noRewards'])('rejects missing section-native %s proof',kind=>expect(check(input=>{const proof=input.touch.runtime.kanbanSectionTouch;if(kind==='missing')delete input.touch.runtime.kanbanSectionTouch;else if(kind==='pointer-kind')proof.pointer.pointerType='mouse';else if(kind==='untrusted')proof.pointer.trusted=false;else if(kind==='version')proof.version=2;else if(kind==='viewport')proof.viewport.width=1280;else proof[kind]=false;})).not.toEqual([]));
it('unknown native touch capability cannot silently fall back to historical admission',()=>expect(check(input=>input.kanbanSectionTouchVersion=2)).not.toEqual([]));
