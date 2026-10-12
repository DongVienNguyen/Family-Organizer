import {expect,it} from 'vitest';
import {isDeepStrictEqual} from 'node:util';
import {captureRecoverySettings,selectRecoverySettings,applyRecoverySettings,validateSettingSelection,RecoverySettingsError} from './recoverySettings.js';
const local={geminiApiKey:'synthetic-gemini-source',telegramBotToken:'synthetic-bot-source',telegramChatId:'synthetic-chat-source',telegramWeeklyDigestOwnerId:'synthetic-admin',rewardsEnabled:'1',unrelatedPrivate:'synthetic-unselected'};
it('captures only explicit setting groups without mutating local configuration',()=>{
 const before={...local},value=captureRecoverySettings(local,['gemini']);expect(isDeepStrictEqual(value,{format:1,groups:['gemini'],values:{geminiApiKey:local.geminiApiKey}})).toBe(true);expect(isDeepStrictEqual(local,before)).toBe(true);
});
it('keeps Telegram credentials and the canonical digest actor as one selection group',()=>{
 const value=captureRecoverySettings(local,['telegram']);expect(Object.keys(value.values).sort()).toEqual(['telegramBotToken','telegramChatId','telegramWeeklyDigestOwnerId'].sort());expect(value.groups).toEqual(['telegram']);expect(Object.hasOwn(value.values,'geminiApiKey')).toBe(false);
});
it('records absent selected keys as explicit nulls without silently selecting other keys',()=>{const value=captureRecoverySettings({},['gemini','telegram']);expect(Object.values(value.values).every(value=>value===null)).toBe(true);expect(Object.keys(value.values).length).toBe(4);});
it('restores only the explicitly chosen subset and preserves all other local settings',()=>{
 const saved=captureRecoverySettings(local,['gemini','telegram']);const destination={...local,geminiApiKey:'synthetic-target-gemini',telegramBotToken:'synthetic-target-bot'};const before={...destination};const patch=selectRecoverySettings(saved,['gemini']);const result=applyRecoverySettings(destination,patch);
 expect(isDeepStrictEqual(result,{...destination,geminiApiKey:local.geminiApiKey})).toBe(true);expect(isDeepStrictEqual(destination,before)).toBe(true);
});
it('explicit absent values remove selected target credentials while retaining unselected credentials',()=>{const patch=selectRecoverySettings(captureRecoverySettings({},['gemini']),['gemini']);const result=applyRecoverySettings(local,patch);expect(Object.hasOwn(result,'geminiApiKey')).toBe(false);expect(result.telegramBotToken===local.telegramBotToken).toBe(true);});
it('rejects unbranded private overrides at the shared restore boundary',()=>{expect(()=>applyRecoverySettings(local,{geminiApiKey:'synthetic-forged'} as any)).toThrow('RECOVERY_SETTINGS_INVALID');});
it('cannot restore a group absent from the authenticated backup',()=>{expect(()=>selectRecoverySettings(captureRecoverySettings(local,['gemini']),['telegram'])).toThrow('RECOVERY_SETTINGS_INVALID');});
it.each([['unknown'],['gemini','gemini'],['telegram','unknown'],['constructor'],[1],null,'gemini'])('rejects invalid setting selection %#',value=>{expect(()=>validateSettingSelection(value)).toThrow(new RecoverySettingsError('RECOVERY_SETTINGS_INVALID'));});
it.each(['unknown-group','extra-value','missing-value','array-value','control-character','oversize','bad-version','extra-field'])('rejects %s authenticated settings metadata',kind=>{
 const value:any=captureRecoverySettings(local,['gemini']);
 const candidate=JSON.parse(JSON.stringify(value));
 if(kind==='unknown-group')candidate.groups=['unknown'];if(kind==='extra-value')candidate.values.unrelatedPrivate='synthetic-extra';if(kind==='missing-value')delete candidate.values.geminiApiKey;if(kind==='array-value')candidate.values.geminiApiKey=[];if(kind==='control-character')candidate.values.geminiApiKey='synthetic\nkey';if(kind==='oversize')candidate.values.geminiApiKey='x'.repeat(513);if(kind==='bad-version')candidate.format=2;if(kind==='extra-field')candidate.extra=true;
 expect(()=>selectRecoverySettings(candidate,['gemini'])).toThrow('RECOVERY_SETTINGS_INVALID');
});
