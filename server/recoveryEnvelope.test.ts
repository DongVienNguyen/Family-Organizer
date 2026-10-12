import {expect,it} from 'vitest';
import {randomBytes} from 'node:crypto';
import {encryptRecovery,decryptRecovery,authenticateRecovery,recoveryEnvelopeLimit,RecoveryEnvelopeError} from './recoveryEnvelope.js';
const key=randomBytes(32),plain=Buffer.from('Synthetic recovery passwordHash and private business data');
it('round-trips opaque bytes across independent keys/roots without exposing plaintext',()=>{
 const envelope=encryptRecovery(plain,key);expect(envelope.includes(plain)).toBe(false);expect(envelope.includes(key)).toBe(false);expect(decryptRecovery(envelope,Buffer.from(key))).toEqual(plain);
});
it('uses unpredictable unique nonces for repeated identical snapshots',()=>{
 const seen=new Set(Array.from({length:128},()=>encryptRecovery(plain,key).subarray(20,32).toString('hex')));expect(seen.size).toBe(128);
});
it.each(['key','magic','length','nonce','ciphertext','tag','truncated','trailing'])('rejects %s tampering with a constant error and no plaintext output',kind=>{
 let bytes=encryptRecovery(plain,key),secret=key;
 if(kind==='key')secret=randomBytes(32);
 else if(kind==='truncated')bytes=bytes.subarray(0,bytes.length-1);
 else if(kind==='trailing')bytes=Buffer.concat([bytes,Buffer.from([0])]);
 else bytes[kind==='magic'?0:kind==='length'?16:kind==='nonce'?20:kind==='ciphertext'?32:bytes.length-1]^=1;
 expect(()=>decryptRecovery(bytes,secret)).toThrow(new RecoveryEnvelopeError('RECOVERY_ENVELOPE_INVALID'));
});
it.each([0,1,31,33,64])('refuses a key of %i bytes rather than interpreting a passphrase',size=>{
 expect(()=>encryptRecovery(plain,Buffer.alloc(size))).toThrow('RECOVERY_ENVELOPE_INVALID');expect(()=>decryptRecovery(Buffer.alloc(48),Buffer.alloc(size))).toThrow('RECOVERY_ENVELOPE_INVALID');
});
it('rejects empty, forged oversized and non-buffer inputs before decryption/allocation',()=>{
 expect(()=>encryptRecovery(Buffer.alloc(0),key)).toThrow('RECOVERY_ENVELOPE_INVALID');
 const forged=Buffer.alloc(48);Buffer.from('FO-RECOVERY-0001').copy(forged);forged.writeUInt32BE(recoveryEnvelopeLimit+1,16);
 expect(()=>decryptRecovery(forged,key)).toThrow('RECOVERY_ENVELOPE_INVALID');
 expect(()=>encryptRecovery('text' as any,key)).toThrow('RECOVERY_ENVELOPE_INVALID');expect(()=>decryptRecovery({} as any,key)).toThrow('RECOVERY_ENVELOPE_INVALID');
});

it('authenticates opaque ciphertext without returning or changing plaintext/cipher/key buffers',()=>{const before=Buffer.from(key),bytes=encryptRecovery(Buffer.alloc(200000,17),key),cipher=Buffer.from(bytes);expect(authenticateRecovery(bytes,key)).toBeUndefined();expect(bytes).toEqual(cipher);expect(key).toEqual(before);});
it.each(['key','magic','length','nonce','ciphertext','tag','truncated','trailing'])('authentication-only refuses %s tampering',kind=>{let bytes=encryptRecovery(plain,key),secret=key;if(kind==='key')secret=randomBytes(32);else if(kind==='truncated')bytes=bytes.subarray(0,bytes.length-1);else if(kind==='trailing')bytes=Buffer.concat([bytes,Buffer.from([0])]);else bytes[kind==='magic'?0:kind==='length'?16:kind==='nonce'?20:kind==='ciphertext'?32:bytes.length-1]^=1;expect(()=>authenticateRecovery(bytes,secret)).toThrow('RECOVERY_ENVELOPE_INVALID');});
