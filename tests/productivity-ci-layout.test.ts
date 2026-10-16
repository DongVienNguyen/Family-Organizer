import {it,expect} from 'vitest';import fs from 'node:fs';import {parse} from 'yaml';
import {evaluateProducers,waitForProducers} from '../scripts/ci/wait-productivity-producers.mjs';
const read=(file:string)=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),jobs=parse(read('.github/workflows/ci.yml')).jobs;
it('uses the existing eight Windows checks and three separate producer jobs without retries or larger deadlines',()=>{expect(Object.keys(jobs)).toHaveLength(7);expect(jobs.quality.strategy.matrix.include.map((r:any)=>r.major)).toEqual([22,24]);expect(jobs.quality['timeout-minutes']).toBe(20);for(const id of ['browser','productivity-browser'])expect(jobs[id]['timeout-minutes']).toBe(25);for(const [id,project]of [['quality','chromium'],['browser','firefox'],['productivity-browser','webkit']]){const step=jobs[id].steps.find((s:any)=>s.run==='./scripts/ci/Test-ProductivityBrowser.ps1 -Project '+project);expect(step).toBeDefined();if(id==='quality')expect(step.if).toContain('matrix.major == 24');expect(jobs[id]['runs-on']).toBe('windows-2022');}expect(jobs['productivity-browser'].needs).toBeUndefined();const runner=read('scripts/ci/run-productivity-browser.mjs');expect(runner).toContain('12*60*1000');expect(runner).toContain('2*60*1000');expect(read('playwright.config.ts')).toContain('retries: 0');});
it('downloads only exact same-run SHA and attempt artifacts outside report output and checks native merge exit immediately',()=>{const steps=jobs['productivity-browser'].steps,downloads=steps.filter((s:any)=>s.uses?.startsWith('actions/download-artifact@'));expect(downloads).toHaveLength(2);for(const [index,prefix]of ['windows-node24','windows-browsers'].entries()){expect(downloads[index].with.name).toBe(prefix+'-${{ github.event.pull_request.head.sha || github.sha }}-${{ github.run_attempt }}');expect(downloads[index].with.path).toMatch(/^\$\{\{ runner.temp \}\}\//);expect(downloads[index].with['run-id']).toBeUndefined();}const step=steps.find((s:any)=>s.id==='aggregate');expect(step.run).toMatch(/& node scripts\/ci\/merge-productivity-browser.mjs[^\n]*\n\s*\$mergeCode = \$LASTEXITCODE/);expect(step.run).toContain('if ($mergeCode -ne 0) { exit $mergeCode }');expect(steps.find((s:any)=>s.name==='Validate browser evidence').env.CHECK_BROWSER).toBe('${{ steps.aggregate.outcome }}');});
it('preserves synthetic hidden reports for all producer jobs and records every npm and native exit',()=>{for(const id of ['quality','browser','productivity-browser']){const upload=jobs[id].steps.find((s:any)=>s.uses?.startsWith('actions/upload-artifact@'));expect(upload.with['include-hidden-files']).toBe(true);}const script=read('scripts/ci/Test-ProductivityBrowser.ps1');expect(script).toMatch(/& npm.cmd[^\n]*\n\$installCode = \$LASTEXITCODE/);expect(script).toMatch(/& node @browserArgs[^\n]*\n\$browserCode = \$LASTEXITCODE/);expect(script).toContain('if ($installCode -ne 0)');expect(script).toContain('if ($browserCode -ne 0)');});

it('places a read-only exact-run producer barrier after WebKit and before all artifact downloads',()=>{
  const job=jobs['productivity-browser'],steps=job.steps;
  const browser=steps.findIndex((s:any)=>s.run==='./scripts/ci/Test-ProductivityBrowser.ps1 -Project webkit');
  const barrier=steps.findIndex((s:any)=>s.name==='Wait for exact-run original producers before artifact merge');
  expect(barrier).toBeGreaterThan(browser);
  expect(job.permissions).toEqual({contents:'read',actions:'read'});
  expect(steps[barrier].env).toEqual({GH_TOKEN:'${{ github.token }}'});
  expect(steps[barrier].run).toMatch(/& node scripts\/ci\/wait-productivity-producers.mjs\n\s*\$barrierCode = \$LASTEXITCODE/);
  expect(steps[barrier].run).toContain('if ($barrierCode -ne 0) { exit $barrierCode }');
  for(const [i,step] of steps.entries())if(step.uses?.startsWith('actions/download-artifact@'))expect(i).toBeGreaterThan(barrier);
  expect(jobs['ci-gate'].needs).toEqual(['quality','browser','productivity-browser','package-build','package-test','service-test']);
});

const context={runId:'123',sha:'a'.repeat(40),attempt:1,repository:'DongVienNguyen/Family-Organizer'};
const producerNames=['Windows Node22 baseline','Windows Node24 baseline','Windows production browsers'];
const producerRun=()=>({id:123,head_sha:context.sha,run_attempt:1,repository:{full_name:context.repository}});
const producerPage=()=>({total_count:3,jobs:producerNames.map(name=>({name,run_id:123,run_attempt:1,head_sha:context.sha,status:'completed',conclusion:'success'}))});

it('requires all three original successful jobs and treats missing or running producers as pending',()=>{
  expect(evaluateProducers(producerRun(),producerPage(),context).ready).toBe(true);
  for(let i=0;i<3;i++){
    const pending=producerPage();pending.jobs[i].status='in_progress';pending.jobs[i].conclusion=null as any;
    expect(evaluateProducers(producerRun(),pending,context).ready).toBe(false);
    const absent=producerPage();absent.jobs.splice(i,1);absent.total_count--;
    expect(evaluateProducers(producerRun(),absent,context).ready).toBe(false);
  }
});
it.each(['failure','cancelled','skipped','timed_out','neutral','action_required','stale'])('refuses completed producer conclusion %s',conclusion=>{
  for(let i=0;i<3;i++){const page=producerPage();page.jobs[i].conclusion=conclusion;expect(()=>evaluateProducers(producerRun(),page,context)).toThrow('Required producer failed');}
});
it('refuses another run, source, attempt, repository, duplicated jobs and incomplete pagination',()=>{
  for(const patch of [{id:124},{head_sha:'b'.repeat(40)},{run_attempt:2},{repository:{full_name:'another/repo'}}])expect(()=>evaluateProducers({...producerRun(),...patch},producerPage(),context)).toThrow('run identity mismatch');
  for(const patch of [{run_id:124},{head_sha:'b'.repeat(40)},{run_attempt:2}]){const page=producerPage();Object.assign(page.jobs[0],patch);expect(()=>evaluateProducers(producerRun(),page,context)).toThrow('job identity mismatch');}
  const duplicate=producerPage();duplicate.jobs.push({...duplicate.jobs[0]});duplicate.total_count++;
  expect(()=>evaluateProducers(producerRun(),duplicate,context)).toThrow('duplicate jobs');
  expect(()=>evaluateProducers(producerRun(),{...producerPage(),total_count:4},context)).toThrow('complete job list');
});
it('polls only the original run until ready and records the bounded wait without starting tests',async()=>{
  let clock=0;const paths:string[]=[],saved:any[]=[],pauses:number[]=[];
  await waitForProducers(context,{
    now:()=>clock,pause:async(ms:number)=>{pauses.push(ms);clock+=ms;},save:(value:any)=>saved.push(value),
    read:async(path:string)=>{paths.push(path);if(!path.includes('/jobs?'))return producerRun();const page=producerPage();if(clock===0){page.jobs[0].status='in_progress';page.jobs[0].conclusion=null as any;}return page;},
  },40_000);
  expect(pauses).toEqual([20_000]);expect(saved.map(s=>s.ready)).toEqual([false,true]);expect(saved[1]).toMatchObject({...context,waitedMs:20_000});
  expect(paths).toEqual(['/actions/runs/123','/actions/runs/123/attempts/1/jobs?per_page=100','/actions/runs/123','/actions/runs/123/attempts/1/jobs?per_page=100']);
});
it('fails on deadline and API failure without retrying tests or accepting partial evidence',async()=>{
  let clock=0,reads=0;const saves:any[]=[];
  const ports={now:()=>clock,pause:async(ms:number)=>{clock+=ms;},save:(value:any)=>saves.push(value),read:async(path:string)=>{reads++;return path.includes('/jobs?')?{total_count:0,jobs:[]}:producerRun();}};
  await expect(waitForProducers(context,ports,25_000)).rejects.toThrow('deadline exceeded');
  expect(clock).toBe(25_000);expect(reads).toBe(6);expect(saves.every(s=>!s.ready)).toBe(true);
  await expect(waitForProducers(context,{...ports,read:async()=>{throw new Error('synthetic API refusal');}})).rejects.toThrow('synthetic API refusal');
});
