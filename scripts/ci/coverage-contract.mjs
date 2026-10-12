const metrics = ['lines', 'statements', 'functions', 'branches'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const sameKeys = (a, b) => record(a) && record(b) && JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort());
const sameRows = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const percentage = (total, covered) => total ? Math.floor(10000 * covered / total) / 100 : 100;

export function validateCoverageReports({ summary, full, lcov, sourceFiles, floor }) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  const sources = Array.isArray(sourceFiles) ? sourceFiles : [];
  require(sources.length > 0 && new Set(sources).size === sources.length, 'missing or duplicate source inventory');
  const inventory = [...sources].sort();
  require(record(summary) && JSON.stringify(Object.keys(summary).filter(k => k !== 'total').sort()) === JSON.stringify(inventory), 'summary differs from source inventory');
  require(record(full) && JSON.stringify(Object.keys(full).sort()) === JSON.stringify(inventory), 'raw coverage differs from source inventory');
  const totals = Object.fromEntries(metrics.map(name => [name, { total: 0, covered: 0 }]));
  const derived = new Map();
  function compare(actual, expected, where) {
    for (const name of metrics) {
      const value = actual?.[name], target = expected[name];
      require(value?.total === target.total && value?.covered === target.covered && value?.skipped === 0 && value?.pct === percentage(target.total, target.covered), `${where}: inconsistent ${name} counters/percentage`);
    }
  }
  for (const file of sources) {
    const data = full?.[file];
    if (!record(data) || !sameKeys(data.s, data.statementMap) || !sameKeys(data.f, data.fnMap) || !sameKeys(data.b, data.branchMap)) { errors.push(`${file}: missing raw definitions/counters`); continue; }
    require(data.path === file, `${file}: raw source path mismatch`);
    const statements = Object.values(data.s), functions = Object.values(data.f), branches = Object.values(data.b).flat();
    require([...statements, ...functions, ...branches].every(count), `${file}: invalid execution counter`);
    require(Object.keys(data.b).every(key => Array.isArray(data.b[key]) && data.b[key].length > 0 && Array.isArray(data.branchMap[key]?.locations) && data.b[key].length === data.branchMap[key].locations.length), `${file}: branch arity mismatch`);
    const lines = new Map();
    for (const key of Object.keys(data.s)) {
      const line = data.statementMap[key]?.start?.line;
      require(Number.isSafeInteger(line) && line > 0, `${file}: invalid statement line`);
      lines.set(line, Math.max(lines.get(line) || 0, data.s[key]));
    }
    const measure = values => ({ total: values.length, covered: values.filter(n => n > 0).length });
    const values = { statements: measure(statements), functions: measure(functions), branches: measure(branches), lines: measure([...lines.values()]) };
    compare(summary?.[file], values, file);
    for (const name of metrics) { totals[name].total += values[name].total; totals[name].covered += values[name].covered; }
    const functionDefinitions = [], functionExecutions = [], branchExecutions = [];
    for (const [key, meta] of Object.entries(data.fnMap)) {
      const line = (meta?.decl || meta?.loc)?.start?.line;
      require(Number.isSafeInteger(line) && line > 0 && typeof meta?.name === 'string', `${file}: invalid function identity`);
      functionDefinitions.push(`FN:${line},${meta?.name}`);
      functionExecutions.push(`FNDA:${data.f[key]},${meta?.name}`);
    }
    for (const [key, hits] of Object.entries(data.b)) {
      const line = data.branchMap[key]?.loc?.start?.line;
      require(Number.isSafeInteger(line) && line > 0, `${file}: invalid branch line`);
      if (Array.isArray(hits)) hits.forEach((hit, index) => branchExecutions.push(`BRDA:${line},${key},${index},${hit}`));
    }
    derived.set(file, { values, lines, functionDefinitions, functionExecutions, branchExecutions });
  }
  compare(summary?.total, totals, 'global');
  for (const name of metrics) {
    require(totals[name].total > 0, `zero global ${name} coverage`);
    require(typeof floor?.[name] === 'number' && Number.isFinite(floor[name]) && floor[name] >= 0 && floor[name] <= 100 && percentage(totals[name].total, totals[name].covered) >= floor[name], `missing, invalid or regressed ${name} ratchet`);
  }
  require(typeof lcov === 'string' && lcov.trim().endsWith('end_of_record'), 'missing or incomplete LCOV');
  const lcovSources = [];
  for (const chunk of (typeof lcov === 'string' ? lcov.split('end_of_record').filter(part => part.trim()) : [])) {
    const rows = chunk.trim().split(/\r?\n/);
    const paths = rows.filter(row => row.startsWith('SF:')).map(row => row.slice(3).replaceAll('\\', '/'));
    const file = paths[0], raw = derived.get(file);
    require(paths.length === 1 && !!raw, 'LCOV unknown/missing source');
    lcovSources.push(file);
    if (!raw) continue;
    const number = tag => {
      const entries = rows.filter(row => row.startsWith(tag + ':'));
      require(entries.length === 1 && /^\d+$/.test(entries[0]?.slice(tag.length + 1) || ''), `${file}: invalid LCOV ${tag}`);
      return Number(entries[0]?.slice(tag.length + 1));
    };
    const lineRows = rows.filter(row => row.startsWith('DA:')).map(row => row.match(/^DA:(\d+),(\d+)(?:,[^,]+)?$/));
    const lineValues = new Map();
    for (const row of lineRows) {
      if (!row) { errors.push(`${file}: invalid LCOV line`); continue; }
      const line = Number(row[1]), hits = Number(row[2]);
      require(!lineValues.has(line) && count(hits) && hits === raw.lines.get(line), `${file}: duplicate or contradictory LCOV line`);
      lineValues.set(line, hits);
    }
    require(lineValues.size === raw.lines.size && number('LF') === raw.values.lines.total && number('LH') === raw.values.lines.covered, `${file}: LCOV line totals mismatch`);
    const functionRows = rows.filter(row => row.startsWith('FN:'));
    const functionHits = rows.filter(row => row.startsWith('FNDA:'));
    require(sameRows(functionRows, raw.functionDefinitions) && sameRows(functionHits, raw.functionExecutions) && number('FNF') === raw.values.functions.total && number('FNH') === raw.values.functions.covered, `${file}: LCOV function identities/counters mismatch`);
    const branchRows = rows.filter(row => row.startsWith('BRDA:')).map(row => row.match(/^BRDA:(\d+),(\d+),(\d+),(\d+|-)$/));
    const branchKeys = branchRows.map(row => row?.slice(1, 4).join(','));
    require(branchRows.every(Boolean) && new Set(branchKeys).size === branchRows.length && sameRows(rows.filter(row => row.startsWith('BRDA:')), raw.branchExecutions) && number('BRF') === raw.values.branches.total && number('BRH') === raw.values.branches.covered, `${file}: duplicate or contradictory LCOV branch identities/counters`);
  }
  require(lcovSources.length === inventory.length && new Set(lcovSources).size === inventory.length && JSON.stringify(lcovSources.sort()) === JSON.stringify(inventory), 'LCOV differs from source inventory');
  return errors;
}
