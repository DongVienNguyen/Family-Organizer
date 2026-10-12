// Inventory policy for the reviewed dependency closure, not a license text rewrite.
const reviewedIdentifiers=new Set(['MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','BlueOak-1.0.0','MPL-2.0']);
const noticeName=/^(?:license|licence|copying|copyright)(?:[._-]|$)/i;
const readmeName=/^readme(?:[._-]|$)/i;
function completeMit(text){
  const normalized=text.toLowerCase().replace(/["'‘’“”]/g,'').replace(/\s+/g,' ');
  return ['copyright','permission is hereby granted','free of charge','subject to the following conditions','copyright notice and this permission notice','software is provided as is','liability'].every(clause=>normalized.includes(clause));
}
function matchesDeclaration(license,text){
  const normalized=text.toLowerCase().replace(/\s+/g,' ');
  if(license==='MIT')return completeMit(text);
  if(license==='Apache-2.0')return /apache license.*version 2\.0/.test(normalized);
  if(license.startsWith('BSD-'))return normalized.includes('redistribution and use in source and binary forms');
  if(license==='ISC')return normalized.includes('permission to use, copy, modify, and/or distribute');
  if(license==='BlueOak-1.0.0')return normalized.includes('blue oak model license')&&normalized.includes('1.0.0');
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
