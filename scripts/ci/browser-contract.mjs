export const browserProjects = ['chromium', 'firefox', 'webkit'];
export const browserCases = [
  'B01 login reload logout',
  'B02 child finance boundary',
  'B03 note and media visibility',
  'B04 logout purges private storage',
  'B05 account switch removes previous data',
];
export function validateBrowserReports(input) {
  const errors = [];
  const { report, junit, manifest, engines, exits, native, files, checks, expected } = input;
  const require = (condition, message) => { if (!condition) errors.push(message); };
  const specs = [];
  function visit(suites) {
    if (!Array.isArray(suites)) return;
    for (const suite of suites) { specs.push(...(suite.specs || [])); visit(suite.suites); }
  }
  visit(report?.suites);
  const seen = new Set();
  for (const spec of specs) {
    require(browserCases.includes(spec.title) && spec.ok === true, 'undeclared or failed flow');
    for (const test of spec.tests || []) {
      const key = `${test.projectName}/${spec.title}`;
      require(browserProjects.includes(test.projectName) && !seen.has(key), 'unknown or duplicate engine/flow');
      seen.add(key);
      const result = test.results?.[0];
      require(test.expectedStatus === 'passed' && test.status === 'expected' && test.results?.length === 1 &&
        result?.status === 'passed' && result.retry === 0 && Array.isArray(result.errors) && result.errors.length === 0,
      'case failed, skipped, retried, or contains errors');
    }
  }
  for (const engine of browserProjects) for (const title of browserCases) require(seen.has(`${engine}/${title}`), `missing ${engine}/${title}`);
  require(seen.size === 15 && report?.stats?.expected === 15 && ['unexpected', 'flaky', 'skipped'].every(k => report?.stats?.[k] === 0), 'JSON totals contradict required cases');
  require(Array.isArray(report?.errors) && report.errors.length === 0, 'global browser error');
  require(report?.config?.forbidOnly === true && report.config.workers === 1, 'browser configuration changed');
  require(report?.config?.projects?.length === 3 && browserProjects.every(name => report.config.projects.some(p => p.name === name && p.retries === 0)), 'required browser projects or zero-retry policy missing');
  const root = typeof junit === 'string' ? junit.match(/<testsuites\b([^>]*)>/)?.[1] : null;
  require(!!root && ['tests', 'failures', 'errors', 'skipped'].every(name => {
    const value = root.match(new RegExp(`\\b${name}="(\\d+)"`))?.[1];
    return value !== undefined && Number(value) === (name === 'tests' ? 15 : 0);
  }) && (junit.match(/<testcase\b/g) || []).length === 15 && !/<(?:failure|error|skipped)\b/.test(junit), 'missing or contradictory JUnit');
  const junitCases = [];
  for (const suite of (typeof junit === 'string' ? junit.matchAll(/<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g) : [])) {
    const engine = suite[1].match(/\bhostname="([^"]+)"/)?.[1];
    for (const testcase of suite[2].matchAll(/<testcase\b([^>]*)>/g)) junitCases.push(`${engine}/${testcase[1].match(/\bname="([^"]+)"/)?.[1]}`);
  }
  require(junitCases.length === 15 && new Set(junitCases).size === 15 && browserProjects.every(engine => browserCases.every(title => junitCases.includes(`${engine}/${title}`))) && !/<!DOCTYPE|<!ENTITY/.test(junit || ''), 'JUnit engine/case identity contradicts JSON');
  require(manifest?.commitSha === expected.commitSha && manifest?.lockSha256 === expected.lockSha256 && manifest?.nodeVersion === expected.nodeVersion && manifest?.platform === 'win32' && manifest?.architecture === 'x64', 'fixture source/runtime/lock mismatch');
  require(['serverSha256', 'indexSha256'].every(name => /^[a-f0-9]{64}$/.test(manifest?.productionBuild?.[name] || '') && manifest.productionBuild[name] === expected.productionBuild?.[name]), 'missing or mismatched production build identity');
  require(native?.platform === 'win32' && native?.architecture === 'x64' && native?.nodeVersion === expected.nodeVersion && native?.addonVersion === '13.0.3' && /^[a-f0-9]{64}$/.test(native?.binarySha256 || '') && native.binarySha256 === manifest?.addonSha256, 'native addon mismatch');
  require(manifest?.legacyPreserved === true && manifest?.integrity === 'ok' && manifest?.databaseClosed === true && manifest?.fixtureRemoved === true, 'fixture preservation or cleanup failed');
  require(Array.isArray(manifest?.externalAttempts) && manifest.externalAttempts.length === 0, 'provider network attempted');
  require(manifest?.cliExitCode === 0 && manifest?.cliSignal === null && manifest?.serverExitCode === 0 && manifest?.serverSignal === null, 'native browser/server process failed');
  for (const name of ['install', 'native', 'build', 'browsers-install', 'browser']) require(exits?.[name]?.exitCode === 0, `${name}: missing or nonzero native exit`);
  for (const name of ['install', 'native', 'build', 'browser']) require(checks?.[name] === 'success', `${name}: required step not successful`);
  for (const name of ['browser-html/index.html', 'browser-run.log', 'browsers-install.log', 'browser-server.log']) require(files?.includes(name), `missing ${name}`);
  require(engines?.length === 3 && browserProjects.every(name => engines.some(e => e?.browserName === name && typeof e.browserVersion === 'string' && e.browserVersion.length > 0 && /^[a-f0-9]{64}$/.test(e.executableSha256 || '') && e.platform === 'win32' && e.architecture === 'x64' && e.nodeVersion === expected.nodeVersion)), 'missing or invalid actual browser runtime');
  return errors;
}
