import {browserCases} from '../../scripts/ci/browser-contract.mjs';
export function releaseBrowserFixture(names:readonly string[]=browserCases): any {
  const count=names.length*3;
  return {
    expected: { commitSha: 'a'.repeat(40), lockSha256: 'b'.repeat(64), nodeVersion: 'v24.21.0', productionBuild: { serverSha256: 'e'.repeat(64), indexSha256: 'f'.repeat(64) } },
    report: { errors: [], config: { forbidOnly: true, workers: 1, projects: ['chromium', 'firefox', 'webkit'].map(name => ({ name, retries: 0 })) }, stats: { expected: count, unexpected: 0, flaky: 0, skipped: 0 }, suites: [{ specs: names.map(title => ({ title, ok: true, tests: ['chromium', 'firefox', 'webkit'].map(projectName => ({ projectName, expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0, errors: [] }] })) })) }] },
    junit: '<testsuites tests="'+count+'" failures="0" errors="0" skipped="0">' + ['chromium', 'firefox', 'webkit'].map(engine => `<testsuite hostname="${engine}" tests="${names.length}" failures="0" errors="0" skipped="0">` + names.map(name => `<testcase name="${name}" />`).join('') + '</testsuite>').join('') + '</testsuites>',
    manifest: { commitSha: 'a'.repeat(40), lockSha256: 'b'.repeat(64), nodeVersion: 'v24.21.0', platform: 'win32', architecture: 'x64', addonSha256: 'c'.repeat(64), productionBuild: { serverSha256: 'e'.repeat(64), indexSha256: 'f'.repeat(64) }, legacyPreserved: true, integrity: 'ok', databaseClosed: true, fixtureRemoved: true, externalAttempts: [], serverExitCode: 0, serverSignal: null, cliExitCode: 0, cliSignal: null },
    engines: ['chromium', 'firefox', 'webkit'].map(browserName => ({ browserName, browserVersion: '123.4.5', executableSha256: 'd'.repeat(64), platform: 'win32', architecture: 'x64', nodeVersion: 'v24.21.0' })),
    exits: Object.fromEntries(['install', 'native', 'build', 'browsers-install', 'browser'].map(name => [name, { exitCode: 0 }])),
    native: { platform: 'win32', architecture: 'x64', nodeVersion: 'v24.21.0', binarySha256: 'c'.repeat(64), addonVersion: '13.0.3' },
    files: ['browser-html/index.html', 'browser-run.log', 'browsers-install.log', 'browser-server.log'],
    checks: Object.fromEntries(['install', 'native', 'build', 'browser'].map(name => [name, 'success'])),
  };
}