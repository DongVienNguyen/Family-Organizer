import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import ts from 'typescript';
import {boardPackageChecks} from './board-package-contract.mjs';
const reject=()=>{throw Error('RELEASE_BOARD_SOURCE_POLICY_REJECTED');};
const requireFact=value=>{if(!value)reject();};
/** Closed, reviewed capabilities; no report-supplied check list is authority. */
export function validateBoardSourcePolicy(policy){
 if(typeof policy?.groupedRanks!=='boolean'||!/^[a-f0-9]{64}$/.test(policy?.contractSha256??''))return false;
 const atomic=policy.atomicGroupRanks===true,count=atomic?24:policy.groupedRanks?23:22;
 return (!atomic||policy.groupedRanks)&&isDeepStrictEqual(policy.checks,boardPackageChecks.slice(0,count))&&Object.keys(policy).sort().join(',')===(atomic?'atomicGroupRanks,checks,contractSha256,groupedRanks':'checks,contractSha256,groupedRanks');
}
/** Parse the explicit target Git blob as data. Never execute target code. */
export function parseBoardPackageSourcePolicy(text){
 requireFact(typeof text==='string'&&Buffer.byteLength(text)<=1024*1024);
 const source=ts.createSourceFile('board-package-contract.mjs',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);requireFact(source.parseDiagnostics.length===0);
 const declarations=source.statements.flatMap(statement=>ts.isVariableStatement(statement)?statement.declarationList.declarations.filter(d=>ts.isIdentifier(d.name)&&d.name.text==='boardPackageChecks').map(declaration=>({statement,declaration})):[]);requireFact(declarations.length===1);
 const {statement,declaration}=declarations[0],value=declaration.initializer;
 requireFact(statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)&&(statement.declarationList.flags&ts.NodeFlags.Const)!==0&&statement.declarationList.declarations.length===1&&value&&ts.isCallExpression(value)&&value.arguments.length===1&&ts.isPropertyAccessExpression(value.expression)&&ts.isIdentifier(value.expression.expression)&&value.expression.expression.text==='Object'&&value.expression.name.text==='freeze');
 const array=value.arguments[0];requireFact(ts.isArrayLiteralExpression(array)&&[22,23,24].includes(array.elements.length));
 const checks=array.elements.map(element=>{requireFact(ts.isStringLiteral(element));const match=element.getText(source).match(/^'([^'\\\r\n]+)'$/);requireFact(match);return match[1];});
 const policy={checks,groupedRanks:checks.length>=23,...(checks.length===24?{atomicGroupRanks:true}:{}),contractSha256:createHash('sha256').update(text.replace(/(?<!\r)\n/g,'\r\n')).digest('hex')};requireFact(validateBoardSourcePolicy(policy));return policy;
}
