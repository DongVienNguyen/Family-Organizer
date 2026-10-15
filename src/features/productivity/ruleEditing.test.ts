import {it,expect} from 'vitest';
import {changeRuleMode} from './ruleEditing.js';
import type {RuleNode} from './contracts.js';
const low:RuleNode={op:'test',field:'priority',operator:'in',value:['low']},tag:RuleNode={op:'test',field:'tag',operator:'all',value:['synthetic-tag']};
it('wrapping NOT preserves the selected condition rather than replacing it with a default',()=>{const before=structuredClone(low);expect(changeRuleMode(low,'not',1)).toEqual({op:'not',arg:low});expect(low).toEqual(before);});
it('AND to OR keeps every existing operand and does not mutate the captured draft',()=>{const source:RuleNode={op:'and',args:[low,tag]},before=structuredClone(source),changed=changeRuleMode(source,'or',1);expect(changed).toEqual({op:'or',args:[low,tag]});if(changed.op!=='or'||changed.args[0].op!=='test')throw Error('Expected preserved test operand');changed.args[0].value=['high'];expect(source).toEqual(before);});
it('returning to a single condition preserves the first existing condition',()=>{expect(changeRuleMode({op:'not',arg:low},'test',1)).toEqual(low);expect(changeRuleMode({op:'or',args:[tag,low]},'test',1)).toEqual(tag);});
it('reselecting an existing NOT does not add another level or discard values',()=>{expect(changeRuleMode({op:'not',arg:tag},'not',2)).toEqual({op:'not',arg:tag});});
it('grouping a leaf keeps its existing value and refuses exceeding four levels',()=>{expect(changeRuleMode(tag,'and',3)).toEqual({op:'and',args:[tag]});expect(()=>changeRuleMode(tag,'not',4)).toThrow();});
