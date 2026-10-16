import {parseCutoverPackageSourcePolicy} from './release-cutover-source-policy.mjs';
import {parseBoardPackageSourcePolicy} from './release-board-source-policy.mjs';
import {parseProductivityBrowserSourcePolicy} from './release-productivity-source-policy.mjs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {parseDocument,visit,isAlias} from 'yaml';
import {readTrustedSourceFacts} from './release-metadata.mjs';
import {safeArchivePath} from './package-contract.mjs';
const reject=()=>{throw new Error('RELEASE_SOURCE_POLICY_REJECTED');};
const requireFact=value=>{if(!value)reject();};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function readTrustedReleasePolicy(request,authority){
 try{
  const source=readTrustedSourceFacts(request,authority),started=Date.now();let totalBytes=0;
  const git=args=>{
   requireFact(Date.now()-started<=120000);
   const result=authority.git(args);requireFact(result?.status===0&&result?.signal===null&&!result?.error);
   const bytes=typeof result.stdout==='string'?Buffer.from(result.stdout,'utf8'):result.stdout;
   requireFact(bytes instanceof Uint8Array&&bytes.length<=1024*1024);totalBytes+=bytes.length;requireFact(totalBytes<=16*1024*1024);
   return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  };
  const entries=git(['ls-tree','-rz','--full-tree',request.commitSha]).split('\0');requireFact(entries.pop()===''&&entries.length>0&&entries.length<=20000);
  const files=new Map();for(const entry of entries){const match=entry.match(/^(100644|100755|120000|160000) (blob|commit) ([a-f0-9]{40})\t(.+)$/);requireFact(match&&safeArchivePath(match[4])&&!files.has(match[4]));files.set(match[4],{mode:match[1],type:match[2]});}
  const read=name=>{const file=files.get(name);requireFact(file?.type==='blob'&&['100644','100755'].includes(file.mode));return git(['show',request.commitSha+':'+name]);};
  requireFact(![...files.keys()].some(name=>name.endsWith('/.gitattributes')));
  const attributes=read('.gitattributes').split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
  requireFact(attributes.every(line=>['*.sh text eol=lf','scripts/windows/licenses/*.txt text eol=lf'].includes(line)));
  // Current Windows checkout defaults to CRLF for these text paths. A changed
  // attribute policy is refused until its byte conversion has reviewed support.
  const windowsBytes=text=>Buffer.from(text.replace(/(?<!\r)\n/g,'\r\n'),'utf8');
  const lockSha256=hash(windowsBytes(read('package-lock.json'))),policyBytes=windowsBytes(read('docs/engineering/evidence/windows-coverage-baseline.json'));
  const coveragePolicy=JSON.parse(policyBytes.toString('utf8').replace(/^\uFEFF/,''));
  requireFact(coveragePolicy.schema===1&&coveragePolicy.providerVersion==='4.1.11');
  for(const runtime of ['v22.23.3','v24.21.0'])for(const metric of ['lines','statements','functions','branches']){const floor=coveragePolicy.floors?.[runtime]?.[metric];requireFact(typeof floor==='number'&&Number.isFinite(floor)&&floor>=0&&floor<=100);}
  const inventoryNames=[...files.keys()].filter(name=>/^(src|server)\/.+\.tsx?$/.test(name)&&!/\.test\.tsx?$|\.d\.ts$/.test(name));
  const requiredSuites=[...files.keys()].filter(name=>/^(src|server|tests)\/.+\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/.test(name)&&!name.startsWith('tests/e2e/')).sort((a,b)=>a.localeCompare(b,'en'));
  requireFact(inventoryNames.length>0&&inventoryNames.length<=1500&&requiredSuites.length>0&&requiredSuites.length<=1500);
  // Preflight every mode before reading any source through a possible symlink.
  for(const name of [...inventoryNames,...requiredSuites]){const file=files.get(name);requireFact(file.type==='blob'&&['100644','100755'].includes(file.mode));}
  const boardPackagePolicy=parseBoardPackageSourcePolicy(read('scripts/windows/board-package-contract.mjs'));
  const cutoverPackagePolicy=files.has('scripts/windows/cutover-package-contract.mjs')?parseCutoverPackageSourcePolicy(read('scripts/windows/cutover-package-contract.mjs')):undefined;
  const browserContract=read('scripts/ci/browser-contract.mjs');
  // The pinned builder parser reads syntax only; target code is never executed.
  const syntax=ts.createSourceFile('browser-contract.mjs',browserContract,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  requireFact(syntax.parseDiagnostics.length===0);
  const literalArray=name=>{
   const declarations=syntax.statements.flatMap(statement=>ts.isVariableStatement(statement)?statement.declarationList.declarations.filter(declaration=>ts.isIdentifier(declaration.name)&&declaration.name.text===name).map(declaration=>({statement,declaration})):[]);
   requireFact(declarations.length===1);
   const {statement,declaration}=declarations[0],value=declaration.initializer;
   requireFact(statement.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword)&&(statement.declarationList.flags&ts.NodeFlags.Const)!==0&&statement.declarationList.declarations.length===1&&ts.isArrayLiteralExpression(value)&&value.elements.length>0&&value.elements.length<=99);
   // Continue to support only the reviewed unescaped single-quoted literals.
   return value.elements.map(element=>{requireFact(ts.isStringLiteral(element));const match=element.getText(syntax).match(/^'([^'\\\r\n]+)'$/);requireFact(match);return match[1];});
  };
  const projects=literalArray('browserProjects'),cases=literalArray('browserCases');
  requireFact(JSON.stringify(projects)===JSON.stringify(['chromium','firefox','webkit'])&&new Set(cases).size===cases.length&&cases.every((name,index)=>/^B[0-9]{2} [A-Za-z0-9][A-Za-z0-9 _-]{0,120}$/.test(name)&&name.startsWith('B'+String(index+1).padStart(2,'0')+' ')));
  const browserPolicy={projects,cases,contractSha256:hash(windowsBytes(browserContract))};
  const productivityBrowserPolicy=parseProductivityBrowserSourcePolicy(read('scripts/ci/productivity-browser-contract.mjs'),read('scripts/ci/matrix-touch-contract.mjs'),projects);
  const workflowText=read('.github/workflows/ci.yml');
  // Parse data only. Literal text in env/run blocks never declares a step.
  // Refuse unsupported contexts instead of interpreting target expressions.
  const document=parseDocument(workflowText,{uniqueKeys:true,strict:true});
  requireFact(document.errors.length===0&&document.warnings.length===0);
  visit(document,(_key,node)=>{requireFact(!isAlias(node)&&!node?.anchor);});
  const workflow=document.toJS({maxAliasCount:0}),job=workflow?.jobs?.['package-build'];
  requireFact(workflow?.defaults?.run?.shell==='pwsh'&&Object.keys(workflow.defaults.run).length===1&&job?.['runs-on']==='windows-2022');
  for(const key of ['if','continue-on-error','container','strategy','uses','defaults'])requireFact(!Object.hasOwn(job,key));
  requireFact(Array.isArray(job.steps));
  const matches=job.steps.filter(step=>step?.name==='Prepare independent consumer harness');requireFact(matches.length===1);
  const step=matches[0];requireFact(Object.keys(step).sort().join(',')==='name,run'&&typeof step.run==='string');
  const commands=step.run.replaceAll('\r\n','\n').split('\n');requireFact(commands.pop()==='');
  requireFact([4,13,16].includes(commands.length)&&commands[0]==="$ErrorActionPreference = 'Stop'"&&commands[1]==='New-Item -ItemType Directory -Path reports/package-harness -Force | Out-Null');
  requireFact(cutoverPackagePolicy?commands.length===16:commands.length!==16);
  const flattened=new Set(),harnessSources=[];
  for(const command of commands.slice(2,4)){
   const match=command.match(/^Copy-Item ([A-Za-z0-9/_. ,\-]+) reports\/package-harness$/);requireFact(match);
   for(const name of match[1].split(',').map(value=>value.trim())){
    requireFact(/^scripts\/(?:windows|ci)\/[A-Za-z0-9_-]+\.(?:mjs|cjs|ps1)$/.test(name)&&safeArchivePath(name));
    const flat=name.split('/').at(-1);requireFact(!flattened.has(flat.toLowerCase()));flattened.add(flat.toLowerCase());
    harnessSources.push({sourcePath:name,path:flat,sha256:hash(windowsBytes(read(name)))});
   }
  }
  requireFact(harnessSources.length>0&&harnessSources.length<=100);
  // Generators run only in the reviewed Windows producer. The pinned collector
  // reads their target Git bytes as data; it never imports/executes target TS.
  const generators=[];
  if([13,16].includes(commands.length)){
   const definitions=[
    ['write-productivity-fixture','productivity-fixture.json','fixtureExit','Canonical synthetic fixture generation failed'],
    ['write-board-package-fixture','board-fixture.json','boardFixtureExit','Semantic9 board synthetic fixture generation failed'],
    ['write-wallet-fixture','wallet-fixture.json','walletFixtureExit','Wallet synthetic fixture generation failed'],
    ...(cutoverPackagePolicy?[['write-board-package-fixture','cutover-fixture.json','cutoverFixtureExit','Controlled13 synthetic fixture generation failed']]:[]),
   ];
   for(const [index,[name,path,exitVariable,message]]of definitions.entries()){
    const sourcePath='scripts/ci/'+name+'.ts',offset=4+index*3;
    requireFact(commands[offset]==='& node --import tsx '+sourcePath+' reports/package-harness/'+path+(path==='cutover-fixture.json'?' 13':'')&&commands[offset+1]==='$'+exitVariable+' = $LASTEXITCODE'&&commands[offset+2]==='if ($'+exitVariable+" -ne 0) { throw '"+message+"' }");
    requireFact(!flattened.has(path.toLowerCase()));flattened.add(path.toLowerCase());
    generators.push({sourcePath,path,sourceSha256:hash(windowsBytes(read(sourcePath)))});
   }
  }
  requireFact(harnessSources.length+generators.length<=100);
  const harnessPolicy={workflowSha256:hash(windowsBytes(workflowText)),files:harnessSources.sort((a,b)=>a.sourcePath.localeCompare(b.sourcePath,'en')),...(generators.length?{generators}:{})};
  const sourceInventory=inventoryNames.sort((a,b)=>a.localeCompare(b,'en')).map(name=>{const text=read(name);requireFact(!/\/(?:\*+|\/)\s*(?:v8|c8|istanbul|node:coverage)\s+ignore\b/i.test(text));return {path:name,sha256:hash(windowsBytes(text))};});
  requireFact(Date.now()-started<=120000);
  return {format:1,kind:'trusted-git-release-policy',publicationAllowed:false,source,requiredSuites,sourceInventory,lockSha256,coveragePolicySha256:hash(policyBytes),coveragePolicy,browserPolicy,productivityBrowserPolicy,boardPackagePolicy,...(cutoverPackagePolicy?{cutoverPackagePolicy}:{}),harnessPolicy};
 }catch{reject();}
}
