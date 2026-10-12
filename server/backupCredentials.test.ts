import {expect,it} from 'vitest';
import {ordinaryBackupValue,ordinaryBackupSettings} from './backupCredentials.js';
it('removes structured credentials recursively while preserving business fields and input',()=>{
 const input={title:'Password reminder business text',amount:123,id:'synthetic',items:[{passwordHash:'synthetic-hash',geminiApiKey:'synthetic-ai-key',Authorization:'synthetic-bearer',name:'Preserve display text'}],link:'https://synthetic-user:synthetic-password@example.invalid/path?token=synthetic-token&view=family'};
 const original=structuredClone(input),safe=ordinaryBackupValue(input);
 expect(safe).toEqual({title:input.title,amount:123,id:'synthetic',items:[{name:'Preserve display text'}],link:'https://example.invalid/path?view=family'});expect(input).toEqual(original);
});
it('drops push capabilities and nested settings credentials without rewriting ordinary text',()=>{
 expect(ordinaryBackupValue({endpoint:'https://example.invalid/capability',keys:{p256dh:'synthetic-key',auth:'synthetic-auth'},id:'synthetic-sub'})).toEqual({id:'synthetic-sub'});
 const input={homelabLinks:JSON.stringify([{id:'synthetic-link',url:'https://example.invalid/dashboard?api_key=synthetic',apiKey:'synthetic'}]),rewardsEnabled:'1'};
 expect(ordinaryBackupSettings(input)).toEqual({homelabLinks:JSON.stringify([{id:'synthetic-link',url:'https://example.invalid/dashboard'}]),rewardsEnabled:'1'});expect(input.homelabLinks).toContain('synthetic');
});
it.each(['invalid synthetic secret','"synthetic secret"','null','42'])('omits malformed/unstructured secret-bearing links %s',homelabLinks=>{expect(ordinaryBackupSettings({homelabLinks,rewardsEnabled:'1'})).toEqual({rewardsEnabled:'1'});});
