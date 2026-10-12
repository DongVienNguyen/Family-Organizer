import { describe, expect, it } from 'vitest';
import { validateBrowserReports } from '../scripts/ci/browser-contract.mjs';

// Corrupted synthetic evidence tests the gate, not a claim of browser execution.
const names = ['B01 login reload logout', 'B02 child finance boundary', 'B03 note and media visibility', 'B04 logout purges private storage', 'B05 account switch removes previous data'];
function fixture(): any {
  return {
    expected: { commitSha: 'a'.repeat(40), lockSha256: 'b'.repeat(64), nodeVersion: 'v24.21.0' },
    report: { errors: [], config: { forbidOnly: true, workers: 1, projects: ['chromium', 'firefox', 'webkit'].map(name => ({ name, retries: 0 })) }, stats: { expected: 15, unexpected: 0, flaky: 0, skipped: 0 }, suites: [{ specs: names.map(title => ({ title, ok: true, tests: ['chromium', 'firefox', 'webkit'].map(projectName => ({ projectName, expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0, errors: [] }] })) })) }] },
    junit: '<testsuites tests="15" failures="0" errors="0" skipped="0">' + '<testcase name="synthetic" />'.repeat(15) + '</testsuites>',
    manifest: { commitSha: 'a'.repeat(40), lockSha256: 'b'.repeat(64), nodeVersion: 'v24.21.0', platform: 'win32', architecture: 'x64', addonSha256: 'c'.repeat(64), legacyPreserved: true, integrity: 'ok', databaseClosed: true, fixtureRemoved: true, externalAttempts: [], serverExitCode: 0, serverSignal: null, cliExitCode: 0, cliSignal: null },
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
    ['contradictory JUnit', f => f.junit = f.junit.replace('tests="15"', 'tests="14"')],
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
