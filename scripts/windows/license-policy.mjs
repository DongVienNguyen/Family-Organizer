// Inventory policy for the reviewed dependency closure, not a license text rewrite.
const reviewedIdentifiers=new Set(['MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','BlueOak-1.0.0','MPL-2.0']);
const noticeName=/^(?:license|licence|copying|copyright)(?:[._-]|$)/i;
const readmeName=/^readme(?:[._-]|$)/i;
function completeMit(text){
  const normalized=text.toLowerCase().replace(/["'‘’“”]/g,'').replace(/\s+/g,' ');
  return ['copyright','permission is hereby granted','free of charge','subject to the following conditions','copyright notice and this permission notice','software is provided as is','liability','to deal in the software without restriction','to use, copy, modify, merge, publish, distribute, sublicense, and/or sell','copies or substantial portions','merchantability','fitness for a particular purpose','noninfringement'].every(clause=>normalized.includes(clause));
}
function matchesDeclaration(license,text){
  const normalized=text.toLowerCase().replace(/\s+/g,' ');
  if(license==='MIT')return completeMit(text);
  if(license==='Apache-2.0')return /apache license.*version 2\.0/.test(normalized)&&['grant of copyright license','grant of patent license','redistribution','disclaimer of warranty','limitation of liability','end of terms and conditions'].every(clause=>normalized.includes(clause));
  if(license.startsWith('BSD-')){const complete=['copyright','redistribution and use in source and binary forms','redistributions of source code','redistributions in binary form','disclaimer','merchantability','fitness for a particular purpose','in no event','liable','even if advised'].every(clause=>normalized.includes(clause));const endorsement=/neither the name|names? .*?may (?:not )?be used to endorse/.test(normalized);return complete&&(license==='BSD-3-Clause'?endorsement:!endorsement);}
  if(license==='ISC')return ['copyright','permission to use, copy, modify, and/or distribute','copyright notice and this permission notice','disclaims all warranties','merchantability and fitness','in no event','liable','performance of this software'].every(clause=>normalized.includes(clause));
  if(license==='BlueOak-1.0.0')return normalized.includes('blue oak model license')&&normalized.includes('1.0.0')&&['purpose','acceptance','copyright','notices','excuse','patent','reliability','no liability'].every(clause=>normalized.includes(clause));
  if(license==='MPL-2.0')return /mozilla public license(?:,? (?:version|v\.)?)? ?2\.0/.test(normalized);
  return false;
}
export function classifyLicenseNotice(metadata,entries){
  const license=typeof metadata?.license==='string'?metadata.license:metadata?.license?.type;
  if(!reviewedIdentifiers.has(license))throw new Error('Dependency license identifier requires review');
  if(!Array.isArray(entries)||entries.some(entry=>typeof entry?.name!=='string'||!entry.name||/[\\/:\x00-\x1f]/.test(entry.name)||entry.name==='.'||entry.name==='..'||typeof entry.text!=='string'))throw new Error('Invalid license notice inventory');
  const notices=entries.filter(entry=>noticeName.test(entry.name)&&entry.text.trim().length>0);
  if(notices.length&&notices.some(entry=>matchesDeclaration(license,entry.text)))return {license,licenseTextStatus:'license-file',licenseFiles:notices.map(entry=>entry.name).sort()};
  const readme=entries.find(entry=>readmeName.test(entry.name)&&license==='MIT'&&completeMit(entry.text));
  if(readme)return {license,licenseTextStatus:'embedded-readme',licenseFiles:['package.json',...notices.map(entry=>entry.name).sort(),readme.name]};
  throw new Error('Dependency full license notice missing');
}
