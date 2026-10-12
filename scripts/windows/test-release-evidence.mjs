import fs from 'node:fs';
import {validateReleaseEvidence,validatePromotion} from './release-evidence.mjs';
function read(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw new Error('invalid input');return JSON.parse(fs.readFileSync(file,'utf8'));}
try{
 if(process.argv.length<3||process.argv.length>4)throw new Error('invalid arguments');
 const evidence=read(process.argv[2]);
 const errors=process.argv[3]?validatePromotion(evidence,read(process.argv[3])):validateReleaseEvidence(evidence);
 if(errors.length){console.error('RELEASE_EVIDENCE_REJECTED');process.exitCode=1;}
 else console.log('RELEASE_EVIDENCE_VALIDATED_PUBLICATION_DISABLED');
}catch{console.error('RELEASE_EVIDENCE_REJECTED');process.exitCode=1;}
