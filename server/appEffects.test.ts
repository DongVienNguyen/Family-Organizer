import { it,expect } from 'vitest';
it('drains detached effects before storage ownership can be released',async()=>{
  const m=await import('./appEffects.js').catch(()=>({} as any)); expect(m.trackAppEffect).toBeTypeOf('function');
  let finish!:()=>void; const held=new Promise<void>(resolve=>{finish=resolve;}); let completed=false;
  m.trackAppEffect(held); const draining=m.drainAppEffects().then(()=>{completed=true;});
  await new Promise(resolve=>setTimeout(resolve,10));expect(completed).toBe(false);finish();await draining;expect(completed).toBe(true);
});
