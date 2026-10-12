/** @license SPDX-License-Identifier: Apache-2.0 */
// CLI entry point. Import server/app.ts for isolated route construction.
import readline from 'node:readline';
import { startApplication } from './server/runtime.js';

async function main() {
  const runtime = await startApplication();
  const address = runtime.server.address();

  const input = readline.createInterface({ input: process.stdin });
  let stopping = false;
  async function stop(failed = false) {
    if (failed) process.exitCode = 1;
    if (stopping) return;
    stopping = true;
    // A hung provider/request must not make an unclean stop look successful.
    const hardStop = setTimeout(() => { console.error('Shutdown deadline exceeded'); process.exit(1); }, 35_000);
    try { await runtime.close(); console.log('Shutdown complete'); }
    catch (error) { console.error('Shutdown failed', error); process.exitCode = 1; }
    finally { clearTimeout(hardStop); input.close(); process.exit(process.exitCode || 0); }
  }
  input.on('line', line => { if (line.trim() === 'stop') void stop(); });
  process.on('SIGINT', () => { void stop(); });
  process.on('SIGTERM', () => { void stop(); });
  runtime.server.on('error', error => { console.error('HTTP server failed', error); void stop(true); });
  process.on('uncaughtException', error => { console.error('Fatal runtime error', error); void stop(true); });
  process.on('unhandledRejection', error => { console.error('Fatal background error', error); void stop(true); });
  runtime.ready.then(()=>{
    console.log(`Server is running at http://127.0.0.1:${typeof address === 'object' && address ? address.port : address}`);
  },()=>{if(!stopping){console.error('Startup validation failed');void stop(true);}});
  return runtime;
}
// Local automation receives the same owning runtime used by the CLI, never a
// second server/connection. Startup and normal service handling stay explicit.
export const application = main();
application.catch(error => { console.error('Startup failed', error); process.exitCode = 1; });
