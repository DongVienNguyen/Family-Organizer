import { expect, it } from 'vitest';
import { validateCoverageReports } from '../scripts/ci/coverage-contract.mjs';

// Synthetic counter corruption proves the report gate, not app coverage itself.
function fixture(): any {
  const metric = (total: number, covered: number) => ({ total, covered, skipped: 0, pct: total ? Math.floor(10000 * covered / total) / 100 : 100 });
  const metrics = { lines: metric(2, 2), statements: metric(3, 2), functions: metric(1, 1), branches: metric(2, 1) };
  return {
    sourceFiles: ['server/synthetic.ts'],
    summary: { total: structuredClone(metrics), 'server/synthetic.ts': structuredClone(metrics) },
    full: { 'server/synthetic.ts': { path: 'server/synthetic.ts', statementMap: { 0: { start: { line: 1 } }, 1: { start: { line: 2 } }, 2: { start: { line: 2 } } }, s: { 0: 1, 1: 1, 2: 0 }, fnMap: { 0: { name: 'synthetic', loc: { start: { line: 1 } } } }, f: { 0: 1 }, branchMap: { 0: { loc: { start: { line: 2 } }, locations: [{ start: { line: 2 } }, { start: { line: 2 } }] } }, b: { 0: [1, 0] } } },
    lcov: 'TN:\nSF:server/synthetic.ts\nFN:1,synthetic\nFNDA:1,synthetic\nFNF:1\nFNH:1\nDA:1,1\nDA:2,1\nLF:2\nLH:2\nBRDA:2,0,0,1\nBRDA:2,0,1,0\nBRF:2\nBRH:1\nend_of_record\n',
    floor: { lines: 100, statements: 66.66, functions: 100, branches: 50 },
  };
}
it('accepts agreeing detail, summary, LCOV and measured floors', () => { expect(validateCoverageReports(fixture())).toEqual([]); });
const corruptions: [string, (f: any) => void][] = [
  ['missing summary', f => f.summary = null],
  ['missing raw detail', f => f.full = null],
  ['missing LCOV', f => f.lcov = ''],
  ['empty source inventory', f => f.sourceFiles = []],
  ['missing source summary', f => delete f.summary['server/synthetic.ts']],
  ['missing source detail', f => delete f.full['server/synthetic.ts']],
  ['unaccounted source', f => f.sourceFiles.push('src/uncovered.tsx')],
  ['extra report file', f => f.summary['tests/synthetic.test.ts'] = f.summary['server/synthetic.ts']],
  ['duplicate inventory', f => f.sourceFiles.push('server/synthetic.ts')],
  ['raw source mismatch', f => f.full['server/synthetic.ts'].path = 'src/other.ts'],
  ['negative raw counter', f => f.full['server/synthetic.ts'].s[0] = -1],
  ['fractional raw counter', f => f.full['server/synthetic.ts'].f[0] = 0.5],
  ['missing statement counter', f => delete f.full['server/synthetic.ts'].s[2]],
  ['missing statement definition', f => delete f.full['server/synthetic.ts'].statementMap[2]],
  ['missing function counter', f => delete f.full['server/synthetic.ts'].f[0]],
  ['missing function definition', f => delete f.full['server/synthetic.ts'].fnMap[0]],
  ['missing branch counter', f => delete f.full['server/synthetic.ts'].b[0]],
  ['branch arity mismatch', f => f.full['server/synthetic.ts'].b[0].pop()],
  ['wrong covered statements', f => f.summary['server/synthetic.ts'].statements.covered = 3],
  ['wrong covered lines', f => f.summary['server/synthetic.ts'].lines.covered = 1],
  ['wrong global count', f => f.summary.total.branches.covered = 2],
  ['wrong percentage', f => f.summary.total.branches.pct = 99],
  ['skipped coverage', f => f.summary.total.lines.skipped = 1],
  ['zero global metric', f => f.summary.total.functions.total = 0],
  ['LCOV source mismatch', f => f.lcov = f.lcov.replace('server/synthetic.ts', 'src/other.ts')],
  ['LCOV wrong line count', f => f.lcov = f.lcov.replace('LF:2', 'LF:1')],
  ['LCOV wrong line execution', f => f.lcov = f.lcov.replace('DA:2,1', 'DA:2,0')],
  ['LCOV wrong function definition', f => f.lcov = f.lcov.replace('FN:1,synthetic', 'FN:999,other')],
  ['LCOV wrong function name', f => f.lcov = f.lcov.replace('FNDA:1,synthetic', 'FNDA:1,unrelated')],
  ['LCOV swapped branch hits', f => f.lcov = f.lcov.replace('BRDA:2,0,0,1', 'BRDA:2,0,0,0').replace('BRDA:2,0,1,0', 'BRDA:2,0,1,1')],
  ['LCOV wrong branch line', f => f.lcov = f.lcov.replace('BRDA:2,0,0,1', 'BRDA:999,0,0,1')],
  ['LCOV wrong branch identity', f => f.lcov = f.lcov.replace('BRDA:2,0,0,1', 'BRDA:2,99,0,1')],
  ['LCOV wrong function count', f => f.lcov = f.lcov.replace('FNH:1', 'FNH:0')],
  ['LCOV wrong branch execution', f => f.lcov = f.lcov.replace('BRDA:2,0,0,1', 'BRDA:2,0,0,0')],
  ['LCOV duplicate source', f => f.lcov += f.lcov],
  ['LCOV duplicate line', f => f.lcov = f.lcov.replace('LF:2', 'DA:1,1\nLF:2')],
  ['LCOV duplicate branch', f => f.lcov = f.lcov.replace('BRF:2', 'BRDA:2,0,0,1\nBRF:2')],
  ['LCOV incomplete record', f => f.lcov = f.lcov.replace('end_of_record', '')],
  ['missing ratchet metric', f => delete f.floor.branches],
  ['unmeasured ratchet', f => f.floor = null],
  ['invalid floor', f => f.floor.lines = -1],
  ['line regression', f => f.floor.lines = 100.01],
  ['branch regression', f => f.floor.branches = 50.01],
  ['function regression', f => f.floor.functions = 100.01],
  ['statement regression', f => f.floor.statements = 66.67],
];
it.each(corruptions)('rejects %s', (_name, change) => { const f = fixture(); change(f); expect(validateCoverageReports(f).length).toBeGreaterThan(0); });
