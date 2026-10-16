import ts from 'typescript';
import {createHash}from'node:crypto';
import {isDeepStrictEqual}from'node:util';
import {cutoverPackageChecks}from'./cutover-package-contract.mjs';
const reject=()=>{throw Error('RELEASE_CUTOVER_SOURCE_POLICY_REJECTED');},need=value=>{if(!value)reject();};
export function validateCutoverSourcePolicy(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')==='checks,contractSha256,fixtureVersion,provenance'&&value.fixtureVersion===13&&value.provenance==='exact-verified-zip-v1'&&isDeepStrictEqual(value.checks,[...cutoverPackageChecks])&&typeof value.contractSha256==='string'&&/^[a-f0-9]{64}$/.test(value.contractSha256);}
/** Parse target Git bytes as literal data; never import/evaluate the target. */
export function parseCutoverPackageSourcePolicy(text){
 need(typeof text==='string'&&Buffer.byteLength(text)<=1024*1024);const source=ts.createSourceFile('cutover-package-contract.mjs',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);need(source.parseDiagnostics.length===0);
 const declaration=name=>{const found=source.statements.flatMap(s=>ts.isVariableStatement(s)?s.declarationList.declarations.filter(d=>ts.isIdentifier(d.name)&&d.name.text===name).map(d=>({s,d})):[]);need(found.length===1);const {s,d}=found[0];need(s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)&&(s.declarationList.flags&ts.NodeFlags.Const)!==0&&s.declarationList.declarations.length===1);return d.initializer;};
 const version=declaration('cutoverPackageFixtureVersion');need(ts.isNumericLiteral(version)&&version.getText(source)==='13');
 const frozen=declaration('cutoverPackageChecks');need(ts.isCallExpression(frozen)&&ts.isPropertyAccessExpression(frozen.expression)&&frozen.expression.expression.getText(source)==='Object'&&frozen.expression.name.text==='freeze'&&frozen.arguments.length===1&&ts.isArrayLiteralExpression(frozen.arguments[0]));
 const checks=frozen.arguments[0].elements.map(e=>{need(ts.isStringLiteral(e));const m=e.getText(source).match(/^'([^'\\\r\n]+)'$/);need(m);return m[1];});
 const value={fixtureVersion:13,provenance:'exact-verified-zip-v1',checks,contractSha256:createHash('sha256').update(text.replace(/(?<!\r)\n/g,'\r\n')).digest('hex')};need(validateCutoverSourcePolicy(value));return value;
}
