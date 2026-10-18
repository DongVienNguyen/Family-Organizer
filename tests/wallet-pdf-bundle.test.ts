import {it,expect} from 'vitest';
import {buildSync} from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {syntheticPdfText} from './pdf-text-fixture.js';
it('production aliases embed the existing PDF engine/fonts into a standalone CJS child without node_modules or network',()=>{
 const root=path.resolve(import.meta.dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'wallet pdf bundled données ')),output=path.join(folder,'synthetic.cjs'),pdf=path.join(folder,'synthetic.pdf'),attempts=path.join(folder,'network.jsonl');
 try{
  const script=`import pdfMake from 'pdfmake/build/pdfmake';import fonts from 'pdfmake/build/vfs_fonts';import fs from 'node:fs';pdfMake.addVirtualFileSystem(fonts);async function main(){const value=await pdfMake.createPdf({content:['SYNTHETIC_CJS_RECORD','Tiếng Việt: cà phê','9.007.199.254.740.993 VND']}).getBuffer();fs.writeFileSync(process.argv[2],value);process.stdout.write(JSON.stringify({bytes:value.length,header:Buffer.from(value).subarray(0,5).toString()}));}main().catch(e=>{process.stderr.write(String(e));process.exitCode=1;});`;
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));for(const command of pkg.scripts.build.split(' && ').filter((v:string)=>v.startsWith('esbuild '))){expect(command).toContain('--alias:pdfmake/build/pdfmake=./node_modules/pdfmake/build/pdfmake.js');expect(command).toContain('--alias:pdfmake/build/vfs_fonts=./node_modules/pdfmake/build/vfs_fonts.js');}
  const built=buildSync({absWorkingDir:root,stdin:{contents:script,resolveDir:root,sourcefile:'synthetic-pdf-bundle.ts'},bundle:true,platform:'node',format:'cjs',packages:'external',alias:{'pdfmake/build/pdfmake':'./node_modules/pdfmake/build/pdfmake.js','pdfmake/build/vfs_fonts':'./node_modules/pdfmake/build/vfs_fonts.js'},outfile:output,metafile:true});
  const external=Object.values(built.metafile!.outputs).flatMap(v=>v.imports.filter(i=>i.external).map(i=>i.path));expect(external.filter(v=>!v.startsWith('node:'))).toEqual([]);expect(fs.existsSync(path.join(folder,'node_modules'))).toBe(false);
  const env:NodeJS.ProcessEnv={FO_NETWORK_ATTEMPTS:attempts};for(const [key,value]of Object.entries(process.env))if(['path','systemroot','windir','systemdrive','comspec','pathext','temp','tmp'].includes(key.toLowerCase()))env[key]=value;
  const raw=execFileSync(process.execPath,['--require',path.join(root,'scripts/ci/block-network.cjs'),output,pdf],{cwd:folder,env,encoding:'utf8',stdio:'pipe'}),result=JSON.parse(raw),bytes=fs.readFileSync(pdf);expect(result).toEqual({bytes:bytes.length,header:'%PDF-'});expect(bytes.length).toBeGreaterThan(1000);const text=syntheticPdfText(bytes);expect(text).toContain('SYNTHETIC_CJS_RECORD');expect(text).toContain('Tiếng Việt: cà phê');expect(text).toContain('9.007.199.254.740.993 VND');expect(fs.existsSync(attempts)?fs.readFileSync(attempts,'utf8'):'').toBe('');
 }finally{fs.rmSync(folder,{recursive:true});}expect(fs.existsSync(folder)).toBe(false);
});
