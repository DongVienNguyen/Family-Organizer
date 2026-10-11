import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {it,expect} from 'vitest';
it('loads the real media Markdown policy through production CommonJS external dependencies',()=>{
 const root=fileURLToPath(new URL('..',import.meta.url));
 const source=`import {mediaReferences} from './server/mediaPolicy.ts';
 import assert from 'node:assert/strict';
 const db={users:[],tasks:[],documents:[],transactions:[],assets:[],debts:[],notes:[{id:'synthetic',content:'![external](https://synthetic.invalid/uploads/external.png)\\n[PDF][file]\\n\\n[file]: /uploads/documents/synthetic.pdf'}]};
 assert.deepEqual([...mediaReferences(db).entries()],[['/uploads/documents/synthetic.pdf',[{domain:'notes',id:'synthetic'}]]]);console.log('synthetic compiled media policy passed');`;
 // Bound the native builder to its own completed subprocess. The default
 // persistent worker/service inherits the test fixture CWD and locks it on Windows.
 const options={stdin:{contents:source,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',define:{'import.meta.dirname':'__dirname'}};
 const built=spawnSync(process.execPath,['-e',"process.stdout.write(require('esbuild').buildSync("+JSON.stringify(options)+").outputFiles[0].text)"],{cwd:root,env:{...process.env,ESBUILD_WORKER_THREADS:'0'},encoding:'utf8',timeout:5000});
 expect(built.error).toBeUndefined();expect(built.status,built.stdout+built.stderr).toBe(0);const bundle=built.stdout;
 const result=spawnSync(process.execPath,['--require',path.join(root,'scripts/ci/block-network.cjs'),'-e',bundle],{cwd:root,encoding:'utf8',timeout:5000});
 expect(result.error).toBeUndefined();expect(result.status,result.stdout+result.stderr).toBe(0);expect(result.stdout).toContain('synthetic compiled media policy passed');
});
