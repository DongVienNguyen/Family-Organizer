import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildSync} from 'esbuild';
import {it,expect} from 'vitest';
it('loads the real media Markdown policy through production CommonJS external dependencies',()=>{
 const root=fileURLToPath(new URL('..',import.meta.url));
 const source=`import {mediaReferences} from './server/mediaPolicy.ts';
 import assert from 'node:assert/strict';
 const db={users:[],tasks:[],documents:[],transactions:[],assets:[],debts:[],notes:[{id:'synthetic',content:'![external](https://synthetic.invalid/uploads/external.png)\\n[PDF][file]\\n\\n[file]: /uploads/documents/synthetic.pdf'}]};
 assert.deepEqual([...mediaReferences(db).entries()],[['/uploads/documents/synthetic.pdf',[{domain:'notes',id:'synthetic'}]]]);console.log('synthetic compiled media policy passed');`;
 const bundle=buildSync({stdin:{contents:source,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',define:{'import.meta.dirname':'__dirname'}}).outputFiles[0].text;
 const result=spawnSync(process.execPath,['--require',path.join(root,'scripts/ci/block-network.cjs'),'-e',bundle],{cwd:root,encoding:'utf8',timeout:5000});
 expect(result.error).toBeUndefined();expect(result.status,result.stdout+result.stderr).toBe(0);expect(result.stdout).toContain('synthetic compiled media policy passed');
});
