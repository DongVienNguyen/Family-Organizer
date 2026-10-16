import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

class BarrierError extends Error {}

const producers = ['Windows Node22 baseline', 'Windows Node24 baseline', 'Windows production browsers'];

// A late dependency barrier lets WebKit execute on its own runner immediately.
// This only observes original producers: it never starts or retries any test.
export function evaluateProducers(run, page, context) {
  if (String(run.id) !== context.runId || run.head_sha !== context.sha ||
      run.run_attempt !== context.attempt || run.repository?.full_name !== context.repository) {
    throw new BarrierError('Producer barrier run identity mismatch');
  }
  if (!Array.isArray(page.jobs) || page.total_count !== page.jobs.length || page.total_count > 100) {
    throw new BarrierError('Producer barrier requires a complete job list');
  }
  const selected = producers.map(name => {
    const matches = page.jobs.filter(job => job.name === name);
    if (matches.length > 1) throw new BarrierError('Producer barrier found duplicate jobs');
    const job = matches[0];
    if (!job) return {name, status: 'pending', conclusion: null};
    if (String(job.run_id) !== context.runId || job.run_attempt !== context.attempt || job.head_sha !== context.sha) {
      throw new BarrierError('Producer barrier job identity mismatch');
    }
    if (job.status === 'completed' && job.conclusion !== 'success') {
      throw new BarrierError(`Required producer failed: ${name}`);
    }
    return {name, status: job.status, conclusion: job.conclusion};
  });
  return {ready: selected.every(job => job.status === 'completed' && job.conclusion === 'success'), jobs: selected};
}

export async function waitForProducers(context, {read, pause, now, save}, budget = 12 * 60 * 1000) {
  const started = now();
  while (true) {
    const run = await read(`/actions/runs/${context.runId}`);
    const jobs = await read(`/actions/runs/${context.runId}/attempts/${context.attempt}/jobs?per_page=100`);
    const state = evaluateProducers(run, jobs, context);
    save({...context, ...state, waitedMs: now() - started});
    if (state.ready) return;
    if (now() - started >= budget) throw new BarrierError('Producer barrier deadline exceeded');
    await pause(Math.min(20_000, budget - (now() - started)));
  }
}

async function main() {
  const context = {runId: process.env.GITHUB_RUN_ID, sha: process.env.TEST_COMMIT_SHA,
    attempt: Number(process.env.GITHUB_RUN_ATTEMPT), repository: process.env.GITHUB_REPOSITORY};
  if (!/^\d+$/.test(context.runId ?? '') || !/^[a-f0-9]{40}$/.test(context.sha ?? '') ||
      !Number.isSafeInteger(context.attempt) || context.attempt < 1 ||
      context.repository !== 'DongVienNguyen/Family-Organizer' || !process.env.GH_TOKEN) {
    throw new BarrierError('Producer barrier context is invalid');
  }
  fs.mkdirSync('reports', {recursive: true});
  await waitForProducers(context, {
    now: Date.now,
    pause: ms => new Promise(resolve => setTimeout(resolve, ms)),
    save: state => fs.writeFileSync('reports/producer-barrier.json', JSON.stringify(state, null, 2) + '\n'),
    read: async path => {
      const response = await fetch(`https://api.github.com/repos/${context.repository}${path}`, {
        headers: {Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'}, signal: AbortSignal.timeout(10_000), redirect: 'error',
      });
      if (!response.ok) throw new BarrierError(`Producer barrier API HTTP ${response.status}`);
      return response.json();
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // Never print request objects, response bodies or credentials.
    console.error(error instanceof BarrierError ? error.message : 'Producer barrier network or filesystem failure');
    process.exitCode = 1;
  });
}
