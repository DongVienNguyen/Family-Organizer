import { describe, expect, it } from 'vitest';
import { validateBrowserReports } from '../scripts/ci/browser-contract.mjs';

// Corrupted synthetic evidence tests the gate, not a claim of browser execution.
const names = ['B01 login reload logout', 'B02 child finance boundary', 'B03 note and media visibility', 'B04 logout purges private storage', 'B05 account switch removes previous data', 'B06 shopping and offline meal persistence', 'B07 legacy finance create edit delete persistence', 'B08 adult child approval rewards persistence', 'B09 self profile settings persistence'];
function fixture(): any {
  return {
    expected: { commitSha: 'a'.repeat(40), lockSha256: 'b'.repeat(64), nodeVersion: 'v24.21.0', productionBuild: { serverSha256: 'e'.repeat(64), indexSha256: 'f'.repeat(64) } },
    report: { errors: [], config: { forbidOnly: true, workers: 1, projects: ['chromium', 'firefox', 'webkit'].map(name => ({ name, retries: 0 })) }, stats: { expected: 27, unexpected: 0, flaky: 0, skipped: 0 }, suites: [{ specs: names.map(title => ({ title, ok: true, tests: ['chromium', 'firefox', 'webkit'].map(projectName => ({ projectName, expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0, errors: [] }] })) })) }] },
    junit: '<testsuites tests="27" failures="0" errors="0" skipped="0">' + ['chromium', 'firefox', 'webkit'].map(engine => `<testsuite hostname="${engine}" tests="9" failures="0" errors="0" skipped="0">` + names.map(name => `<testcase name="${name}" />`).join('') + '</testsuite>').join('') + '</testsuites>',
    manifest: { commitSha: 'a'.repeat(40), lockSha256: 'b'.repeat(64), nodeVersion: 'v24.21.0', platform: 'win32', architecture: 'x64', addonSha256: 'c'.repeat(64), productionBuild: { serverSha256: 'e'.repeat(64), indexSha256: 'f'.repeat(64) }, legacyPreserved: true, integrity: 'ok', databaseClosed: true, fixtureRemoved: true, externalAttempts: [], serverExitCode: 0, serverSignal: null, cliExitCode: 0, cliSignal: null },
    engines: ['chromium', 'firefox', 'webkit'].map(browserName => ({ browserName, browserVersion: '123.4.5', executableSha256: 'd'.repeat(64), platform: 'win32', architecture: 'x64', nodeVersion: 'v24.21.0' })),
    exits: Object.fromEntries(['install', 'native', 'build', 'browsers-install', 'browser'].map(name => [name, { exitCode: 0 }])),
    native: { platform: 'win32', architecture: 'x64', nodeVersion: 'v24.21.0', binarySha256: 'c'.repeat(64), addonVersion: '13.0.3' },
    files: ['browser-html/index.html', 'browser-run.log', 'browsers-install.log', 'browser-server.log'],
    checks: Object.fromEntries(['install', 'native', 'build', 'browser'].map(name => [name, 'success'])),
  };
}
describe('browser evidence fails closed', () => {
  it('accepts three consistent first-attempt browser reports', () => { expect(validateBrowserReports(fixture())).toEqual([]); });
  const corruptions: [string, (f: any) => void][] = [
    ['missing production identity', f => delete f.manifest.productionBuild],
    ['missing server identity', f => delete f.manifest.productionBuild.serverSha256],
    ['missing index identity', f => delete f.manifest.productionBuild.indexSha256],
    ['malformed server hash', f => f.manifest.productionBuild.serverSha256 = 'invalid'],
    ['server mismatch', f => f.manifest.productionBuild.serverSha256 = '1'.repeat(64)],
    ['index mismatch', f => f.manifest.productionBuild.indexSha256 = '1'.repeat(64)],
    ['JUnit other case', f => f.junit = f.junit.replace('name="B01 login reload logout"', 'name="unrelated"')],
    ['JUnit duplicate case', f => f.junit = f.junit.replace('name="B01 login reload logout"', 'name="B02 child finance boundary"')],
    ['JUnit duplicate engine', f => f.junit = f.junit.replace('hostname="firefox"', 'hostname="chromium"')],
    ['missing engine', f => f.report.suites[0].specs.forEach((s: any) => s.tests.pop())],
    ['missing flow', f => f.report.suites[0].specs.pop()],
    ['zero tests', f => f.report.suites = []],
    ['unexpected extra flow', f => f.report.suites[0].specs.push({ ...f.report.suites[0].specs[0], title: 'undeclared' })],
    ['duplicate flow', f => f.report.suites[0].specs.push(f.report.suites[0].specs[0])],
    ['skipped case', f => f.report.suites[0].specs[0].tests[0].results[0].status = 'skipped'],
    ['retried case', f => f.report.suites[0].specs[0].tests[0].results[0].retry = 1],
    ['second attempt', f => f.report.suites[0].specs[0].tests[0].results.push({ status: 'passed', retry: 1, errors: [] })],
    ['expected failure', f => f.report.suites[0].specs[0].tests[0].expectedStatus = 'failed'],
    ['hidden result error', f => f.report.suites[0].specs[0].tests[0].results[0].errors.push({ message: 'synthetic' })],
    ['global report error', f => f.report.errors.push({ message: 'synthetic' })],
    ['forbidOnly disabled', f => f.report.config.forbidOnly = false],
    ['retry configured', f => f.report.config.projects[0].retries = 1],
    ['contradictory aggregate', f => f.report.stats.expected = 14],
    ['flaky aggregate', f => f.report.stats.flaky = 1],
    ['missing JSON', f => f.report = null],
    ['missing JUnit', f => f.junit = ''],
    ['contradictory JUnit', f => f.junit = f.junit.replace('tests="27"', 'tests="14"')],
    ['JUnit failure', f => f.junit = f.junit.replace('failures="0"', 'failures="1"')],
    ['JUnit skipped detail', f => f.junit = f.junit.replace('<testcase', '<skipped/><testcase')],
    ['wrong source', f => f.manifest.commitSha = 'e'.repeat(40)],
    ['wrong lockfile', f => f.manifest.lockSha256 = 'e'.repeat(64)],
    ['wrong runtime', f => f.manifest.nodeVersion = 'v22.23.3'],
    ['Linux fixture', f => f.manifest.platform = 'linux'],
    ['ARM fixture', f => f.manifest.architecture = 'arm64'],
    ['native binary mismatch', f => f.manifest.addonSha256 = 'e'.repeat(64)],
    ['unclean database', f => f.manifest.integrity = 'corrupt'],
    ['database left open', f => f.manifest.databaseClosed = false],
    ['fixture retained', f => f.manifest.fixtureRemoved = false],
    ['legacy changed', f => f.manifest.legacyPreserved = false],
    ['provider attempt', f => f.manifest.externalAttempts.push('synthetic.invalid')],
    ['Playwright native failure', f => f.manifest.cliExitCode = 1],
    ['Playwright signal', f => f.manifest.cliSignal = 'SIGTERM'],
    ['server killed', f => f.manifest.serverSignal = 'SIGKILL'],
    ['server nonzero', f => f.manifest.serverExitCode = 1],
    ['missing install exit', f => delete f.exits.install],
    ['native install failure', f => f.exits['browsers-install'].exitCode = 1],
    ['wrapper failure', f => f.exits.browser.exitCode = 1],
    ['cancelled job step', f => f.checks.browser = 'cancelled'],
    ['missing HTML', f => f.files.shift()],
    ['missing server log', f => f.files.pop()],
    ['missing runtime engine', f => f.engines.pop()],
    ['wrong runtime engine', f => f.engines[0].browserName = 'unknown'],
    ['invalid engine hash', f => f.engines[0].executableSha256 = 'invalid'],
    ['missing engine version', f => f.engines[0].browserVersion = ''],
  ];
  it.each(corruptions)('rejects %s', (_name, change) => { const f = fixture(); change(f); expect(validateBrowserReports(f).length).toBeGreaterThan(0); });
});

it('requires the shopping and offline meal-plan flow in every browser engine',()=>{
 const value=fixture();value.report.suites[0].specs=value.report.suites[0].specs.filter((row:any)=>row.title!=='B06 shopping and offline meal persistence');
 const errors=validateBrowserReports(value);
 for(const engine of ['chromium','firefox','webkit'])expect(errors).toContain(`missing ${engine}/B06 shopping and offline meal persistence`);
});

it('requires legacy financial UI persistence in every browser engine',()=>{const value=fixture();value.report.suites[0].specs=value.report.suites[0].specs.filter((row:any)=>row.title!=='B07 legacy finance create edit delete persistence');const errors=validateBrowserReports(value);for(const engine of ['chromium','firefox','webkit'])expect(errors).toContain(`missing ${engine}/B07 legacy finance create edit delete persistence`);});

it('refuses the former21-case matrix when adult-child reward flow is absent',()=>{const value=fixture();value.report.suites[0].specs=value.report.suites[0].specs.filter((spec:any)=>spec.title!=='B08 adult child approval rewards persistence');value.report.stats.expected=21;value.report.suites[0].specs=value.report.suites[0].specs.filter((spec:any)=>spec.title!=='B09 self profile settings persistence');value.junit=value.junit.replace(/<testcase name="B08 adult child approval rewards persistence" \/>/g,'').replace(/<testcase name="B09 self profile settings persistence" \/>/g,'').replace('tests="27"','tests="21"').replaceAll('tests="9"','tests="7"');expect(validateBrowserReports(value)).toContain('missing chromium/B08 adult child approval rewards persistence');});

it('refuses the former24-case matrix when self profile settings flow is absent',()=>{const value=fixture();value.report.suites[0].specs=value.report.suites[0].specs.filter((spec:any)=>spec.title!=='B09 self profile settings persistence');value.report.stats.expected=24;value.junit=value.junit.replace(/<testcase name="B09 self profile settings persistence" \/>/g,'').replace('tests="27"','tests="24"').replaceAll('tests="9"','tests="8"');expect(validateBrowserReports(value)).toContain('missing chromium/B09 self profile settings persistence');});
it.each(['extra-root','truncated-root','duplicate-attribute','unknown-element','invalid-character','extra-declaration'])('refuses structurally invalid raw browser JUnit %s',kind=>{const f=fixture();if(kind==='extra-root')f.junit+='<testsuites tests="0" failures="0" errors="0" skipped="0"></testsuites>';else if(kind==='truncated-root')f.junit=f.junit.replace('</testsuites>','');else if(kind==='duplicate-attribute')f.junit=f.junit.replace('<testsuites ','<testsuites tests="24" ');else if(kind==='unknown-element')f.junit=f.junit.replace('</testsuites>','<unknown /></testsuites>');else if(kind==='invalid-character')f.junit=f.junit.replace('hostname="chromium"','hostname="chromium'+String.fromCharCode(0)+'"');else f.junit+='<?xml version="1.0"?>';expect(validateBrowserReports(f).length).toBeGreaterThan(0);});
it('checks an explicit target Git browser matrix rather than imposing current cases on older reports',()=>{const f=fixture(),cases=names.slice(0,-1);f.report.suites[0].specs=f.report.suites[0].specs.slice(0,-1);f.report.stats.expected=cases.length*3;f.junit=f.junit.split('<testcase name="'+names.at(-1)+'" />').join('').replace('tests="'+names.length*3+'"','tests="'+cases.length*3+'"').replaceAll('tests="'+names.length+'"','tests="'+cases.length+'"');expect(validateBrowserReports(f,{projects:['chromium','firefox','webkit'],cases})).toEqual([]);});

it.each(['forbidden-character-data','non-xml-leading-space','non-xml-trailing-space'])('rejects malformed XML text %s',kind=>{const f=fixture();if(kind==='forbidden-character-data')f.junit=f.junit.replace('<testcase name="B01 login reload logout" />','<testcase name="B01 login reload logout"><system-out>]]></system-out></testcase>');else if(kind==='non-xml-leading-space')f.junit='\u00a0'+f.junit;else f.junit+='\u00a0';expect(validateBrowserReports(f).length).toBeGreaterThan(0);});
