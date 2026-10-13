import {it,expect} from 'vitest';
import * as policy from '../scripts/windows/caddy-contract.mjs';
const diagnostic=(value:any)=>(policy as any).syntheticCaddyFailureDiagnostic(value);
it('retains only bounded synthetic child output and primitive failure observations',()=>{
 const error=Object.assign(new Error('synthetic private exception message'),{code:'ERR_ASSERTION',cause:{token:'synthetic private cause'}});
 const result=diagnostic({phase:'startup',error,output:'synthetic Caddy bind failure\n',exitCode:1,signal:null});
 expect(result).toMatchObject({scope:'synthetic-loopback-only',diagnosticOnly:true,phase:'startup',errorCode:'ERR_ASSERTION',childExitCode:1,childSignal:null,output:'synthetic Caddy bind failure\n',outputTruncated:false});
 expect(JSON.stringify(result)).not.toContain('synthetic private');
});
it('bounds UTF8 output without splitting the retained final Unicode message',()=>{
 const result=diagnostic({phase:'startup',error:new Error(),output:'đ'.repeat(10000)+'\nSynthetic dữ liệu cuối',exitCode:1,signal:null});
 expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(8192);expect(result.output.endsWith('Synthetic dữ liệu cuối')).toBe(true);expect(result.output).not.toContain('\uFFFD');expect(result.outputTruncated).toBe(true);expect(result.observedOutputBytes).toBeGreaterThan(8192);
});
it('keeps pending child observations distinct from successful native exit',()=>{
 expect(diagnostic({phase:'startup',error:new Error(),output:'',exitCode:null,signal:null})).toMatchObject({childExitCode:null,childSignal:null,diagnosticOnly:true});
});
it('rejects caller-supplied diagnostic phases rather than accepting arbitrary context',()=>{
 expect(()=>diagnostic({phase:'production',error:new Error(),output:'synthetic',exitCode:1,signal:null})).toThrow('CADDY_DIAGNOSTIC_REJECTED');
});
it('does not serialize arbitrary error codes or error cause objects',()=>{
 const result=diagnostic({phase:'tls',error:{code:'synthetic secret / arbitrary',message:'synthetic secret',cause:{token:'synthetic secret'}},output:'synthetic',exitCode:1,signal:null});
 expect(result.errorCode).toBeNull();expect(JSON.stringify(result)).not.toContain('secret');
});
