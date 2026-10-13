import {parseReleaseJUnit} from '../windows/release-quality-reports.mjs';
export const browserProjects = ['chromium', 'firefox', 'webkit'];
export const browserCases = [
  'B01 login reload logout',
  'B02 child finance boundary',
  'B03 note and media visibility',
  'B04 logout purges private storage',
  'B05 account switch removes previous data',
  'B06 shopping and offline meal persistence',
  'B07 legacy finance create edit delete persistence',
  'B08 adult child approval rewards persistence',
  'B09 self profile settings persistence',
  'B10 assistant loading error close',
];
export function validateBrowserReports(input, policy) {
  const requiredProjects=policy?.projects??browserProjects,requiredFlows=policy?.cases??browserCases;
  if(!Array.isArray(requiredProjects)||JSON.stringify(requiredProjects)!==JSON.stringify(browserProjects)||!Array.isArray(requiredFlows)||requiredFlows.length===0||requiredFlows.length>99||new Set(requiredFlows).size!==requiredFlows.length||!requiredFlows.every(name=>typeof name==='string'&&name.length>0))return ['invalid target browser policy'];
  const errors = [];
  const requiredCases = requiredProjects.length * requiredFlows.length;
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
    require(requiredFlows.includes(spec.title) && spec.ok === true, 'undeclared or failed flow');
    for (const test of spec.tests || []) {
      const key = `${test.projectName}/${spec.title}`;
      require(requiredProjects.includes(test.projectName) && !seen.has(key), 'unknown or duplicate engine/flow');
      seen.add(key);
      const result = test.results?.[0];
      require(test.expectedStatus === 'passed' && test.status === 'expected' && test.results?.length === 1 &&
        result?.status === 'passed' && result.retry === 0 && Array.isArray(result.errors) && result.errors.length === 0,
      'case failed, skipped, retried, or contains errors');
    }
  }
  for (const engine of requiredProjects) for (const title of requiredFlows) require(seen.has(`${engine}/${title}`), `missing ${engine}/${title}`);
  require(seen.size === requiredCases && report?.stats?.expected === requiredCases && ['unexpected', 'flaky', 'skipped'].every(k => report?.stats?.[k] === 0), 'JSON totals contradict required cases');
  require(Array.isArray(report?.errors) && report.errors.length === 0, 'global browser error');
  require(report?.config?.forbidOnly === true && report.config.workers === 1, 'browser configuration changed');
  require(report?.config?.projects?.length === 3 && requiredProjects.every(name => report.config.projects.some(p => p.name === name && p.retries === 0)), 'required browser projects or zero-retry policy missing');
  try{
    const tree=parseReleaseJUnit(junit),identities=[];
    const count=(attributes,name,value)=>/^[0-9]+$/.test(attributes[name]??'')&&Number(attributes[name])===value;
    require(['tests','failures','errors','skipped'].every(name=>count(tree.attributes,name,name==='tests'?requiredCases:0)),'JUnit root totals contradict required cases');
    for(const suite of tree.children){
      const engine=suite.attributes.hostname,cases=suite.children.filter(node=>node.tag==='testcase');
      require(requiredProjects.includes(engine)&&['tests','failures','errors','skipped'].every(name=>count(suite.attributes,name,name==='tests'?cases.length:0)),'JUnit suite identity/totals mismatch');
      for(const testcase of cases){identities.push(engine+'/'+testcase.attributes.name);require(testcase.children.every(node=>['system-out','system-err'].includes(node.tag)),'JUnit failed/skipped case');}
    }
    require(identities.length===requiredCases&&new Set(identities).size===requiredCases&&requiredProjects.every(engine=>requiredFlows.every(title=>identities.includes(engine+'/'+title))),'JUnit engine/case identity contradicts JSON');
  }catch{errors.push('invalid raw browser JUnit');}
  require(manifest?.commitSha === expected.commitSha && manifest?.lockSha256 === expected.lockSha256 && manifest?.nodeVersion === expected.nodeVersion && manifest?.platform === 'win32' && manifest?.architecture === 'x64', 'fixture source/runtime/lock mismatch');
  require(['serverSha256', 'indexSha256'].every(name => /^[a-f0-9]{64}$/.test(manifest?.productionBuild?.[name] || '') && manifest.productionBuild[name] === expected.productionBuild?.[name]), 'missing or mismatched production build identity');
  require(native?.platform === 'win32' && native?.architecture === 'x64' && native?.nodeVersion === expected.nodeVersion && native?.addonVersion === '13.0.3' && /^[a-f0-9]{64}$/.test(native?.binarySha256 || '') && native.binarySha256 === manifest?.addonSha256, 'native addon mismatch');
  require(manifest?.legacyPreserved === true && manifest?.integrity === 'ok' && manifest?.databaseClosed === true && manifest?.fixtureRemoved === true, 'fixture preservation or cleanup failed');
  require(Array.isArray(manifest?.externalAttempts) && manifest.externalAttempts.length === 0, 'provider network attempted');
  require(manifest?.cliExitCode === 0 && manifest?.cliSignal === null && manifest?.serverExitCode === 0 && manifest?.serverSignal === null, 'native browser/server process failed');
  for (const name of ['install', 'native', 'build', 'browsers-install', 'browser']) require(exits?.[name]?.exitCode === 0, `${name}: missing or nonzero native exit`);
  for (const name of ['install', 'native', 'build', 'browser']) require(checks?.[name] === 'success', `${name}: required step not successful`);
  for (const name of ['browser-html/index.html', 'browser-run.log', 'browsers-install.log', 'browser-server.log']) require(files?.includes(name), `missing ${name}`);
  require(engines?.length === 3 && requiredProjects.every(name => engines.some(e => e?.browserName === name && typeof e.browserVersion === 'string' && e.browserVersion.length > 0 && /^[a-f0-9]{64}$/.test(e.executableSha256 || '') && e.platform === 'win32' && e.architecture === 'x64' && e.nodeVersion === expected.nodeVersion)), 'missing or invalid actual browser runtime');
  return errors;
}
