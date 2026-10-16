import {createHash} from 'node:crypto';
import ts from 'typescript';
const reject=()=>{throw Error('RELEASE_PRODUCTIVITY_SOURCE_POLICY_REJECTED');};
const requireFact=value=>{if(!value)reject();};
const hash=text=>createHash('sha256').update(text.replace(/(?<!\r)\n/g,'\r\n')).digest('hex');
function syntax(text,name){requireFact(typeof text==='string'&&Buffer.byteLength(text)<=1024*1024);const value=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);requireFact(value.parseDiagnostics.length===0);return value;}
function exportedValue(source,name){
 const matches=source.statements.flatMap(statement=>ts.isVariableStatement(statement)?statement.declarationList.declarations.filter(d=>ts.isIdentifier(d.name)&&d.name.text===name).map(declaration=>({statement,declaration})):[]);requireFact(matches.length===1);
 const {statement,declaration}=matches[0];requireFact(statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)&&(statement.declarationList.flags&ts.NodeFlags.Const)!==0&&statement.declarationList.declarations.length===1);return declaration.initializer;
}
function literal(source,node){requireFact(node&&ts.isStringLiteral(node));const match=node.getText(source).match(/^'([^'\\\r\n]+)'$|^"([^"\\\r\n]+)"$/);requireFact(match);return match[1]??match[2];}
/** Parse target source as data. No target import, eval, generator or browser run. */
export function parseProductivityBrowserSourcePolicy(contract,touchContract,projects){
 requireFact(JSON.stringify(projects)===JSON.stringify(['chromium','firefox','webkit']));const source=syntax(contract,'productivity-browser-contract.mjs'),value=exportedValue(source,'productivityBrowserCases');requireFact(value&&ts.isArrayLiteralExpression(value)&&value.elements.length>0&&value.elements.length<=99);
 const cases=value.elements.map(node=>literal(source,node));requireFact(new Set(cases).size===cases.length&&cases.every((name,index)=>/^P[0-9]{2} C[0-9]{2} [^\r\n]{1,300}$/.test(name)&&name.slice(4,7)==='C'+String(index+1).padStart(2,'0')));
 const declarations=source.statements.flatMap(statement=>ts.isVariableStatement(statement)?statement.declarationList.declarations.filter(d=>ts.isIdentifier(d.name)&&d.name.text==='productivityFixtureVersion'):[]);let fixtureVersion;
 if(declarations.length){const version=exportedValue(source,'productivityFixtureVersion');requireFact(ts.isNumericLiteral(version)&&version.getText(source)==='9');fixtureVersion=9;}
 requireFact(!cases.some(name=>name.startsWith('P09 '))||fixtureVersion===9);
 const touchSource=syntax(touchContract,'matrix-touch-contract.mjs'),touchCase=literal(touchSource,exportedValue(touchSource,'matrixTouchCase'));requireFact(/^P[0-9]{2} touch [^\r\n]{1,300}$/.test(touchCase));
 return {projects:[...projects],cases,...(fixtureVersion===9?{fixtureVersion}:{}),contractSha256:hash(contract),touch:{project:'chromium',case:touchCase,contractSha256:hash(touchContract)}};
}
