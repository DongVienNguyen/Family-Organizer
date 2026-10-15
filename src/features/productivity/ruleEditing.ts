import type {RuleNode} from './contracts.js';
const firstCondition=(node:RuleNode):RuleNode=>node.op==='test'?structuredClone(node):node.op==='not'?firstCondition(node.arg):firstCondition(node.args[0]);
/** Changing a builder operator preserves explicitly chosen values/operands. */
export function changeRuleMode(node:RuleNode,mode:RuleNode['op'],depth:number):RuleNode {
 if(!['test','and','or','not'].includes(mode)||!Number.isSafeInteger(depth)||depth<1||depth>4)throw Error('Invalid rule edit');
 if(mode===node.op)return structuredClone(node);if(mode==='test')return firstCondition(node);if(depth>=4)throw Error('Matrix rule depth limit');
 if(mode==='not')return {op:'not',arg:structuredClone(node)};
 return {op:mode,args:structuredClone(node.op==='and'||node.op==='or'?node.args:node.op==='not'?[node.arg]:[node])};
}
