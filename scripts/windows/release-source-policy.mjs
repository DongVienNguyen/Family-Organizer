import {createHash} from 'node:crypto';
import ts from 'typescript';
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
  const sourceInventory=inventoryNames.sort((a,b)=>a.localeCompare(b,'en')).map(name=>{const text=read(name);requireFact(!/\/(?:\*+|\/)\s*(?:v8|c8|istanbul|node:coverage)\s+ignore\b/i.test(text));return {path:name,sha256:hash(windowsBytes(text))};});
  requireFact(Date.now()-started<=120000);
  return {format:1,kind:'trusted-git-release-policy',publicationAllowed:false,source,requiredSuites,sourceInventory,lockSha256,coveragePolicySha256:hash(policyBytes),coveragePolicy,browserPolicy};
 }catch{reject();}
}
