/** Portable authenticated recovery bytes. The 32-byte key is never stored in the envelope. */
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
export const recoveryEnvelopeLimit=256*1024*1024;
export const recoveryEnvelopeOverhead=48;
export class RecoveryEnvelopeError extends Error {}
const magic=Buffer.from('FO-RECOVERY-0001');
function refuse():never{throw new RecoveryEnvelopeError('RECOVERY_ENVELOPE_INVALID');}
function validKey(key:Buffer):void{if(!Buffer.isBuffer(key)||key.length!==32)refuse();}
export function encryptRecovery(bytes:Buffer,key:Buffer):Buffer{
 validKey(key);if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>recoveryEnvelopeLimit)refuse();
 const header=Buffer.alloc(32);magic.copy(header);header.writeUInt32BE(bytes.length,16);randomBytes(12).copy(header,20);
 const cipher=createCipheriv('aes-256-gcm',key,header.subarray(20),{authTagLength:16});cipher.setAAD(header);
 return Buffer.concat([header,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);
}
function checkedDecipher(bytes:Buffer,key:Buffer){
 validKey(key);if(!Buffer.isBuffer(bytes)||bytes.length<=recoveryEnvelopeOverhead||bytes.length>recoveryEnvelopeLimit+recoveryEnvelopeOverhead||!bytes.subarray(0,16).equals(magic))refuse();
 const size=bytes.readUInt32BE(16);if(!size||size>recoveryEnvelopeLimit||bytes.length!==size+recoveryEnvelopeOverhead)refuse();
 const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(20,32),{authTagLength:16});decipher.setAAD(bytes.subarray(0,32));decipher.setAuthTag(bytes.subarray(bytes.length-16));return decipher;
}
export function decryptRecovery(bytes:Buffer,key:Buffer):Buffer{
 try{
  const decipher=checkedDecipher(bytes,key),pending=decipher.update(bytes.subarray(32,bytes.length-16));
  try{return Buffer.concat([pending,decipher.final()]);}finally{pending.fill(0);}
 }catch{refuse();}
}
/** Authentication-only transport inspection: never return decrypted values. */
export function authenticateRecovery(bytes:Buffer,key:Buffer):void{
 try{
  const decipher=checkedDecipher(bytes,key);
  for(let offset=32;offset<bytes.length-16;offset+=65536){const plain=decipher.update(bytes.subarray(offset,Math.min(bytes.length-16,offset+65536)));plain.fill(0);}
  const final=decipher.final();final.fill(0);
 }catch{refuse();}
}
