export function releaseCoverageFixture(): any {
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
