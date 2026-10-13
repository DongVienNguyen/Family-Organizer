import {expect,it,vi} from 'vitest';
import {openFocusedAssistant} from './assistantFocus.js';

it('captures the actual launcher before opening when pointer activation leaves prior focus elsewhere',()=>{
 const previous={name:'prior keyboard target'};let active:unknown=previous,captured:unknown;const order:string[]=[];
 const trigger={focus:vi.fn(function(this:unknown){expect(this).toBe(trigger);order.push('focus');active=this;})};
 const open=vi.fn(()=>{order.push('open');captured=active;});
 // Model WebKit pointer activation: click itself has not changed activeElement.
 expect(active).toBe(previous);
 openFocusedAssistant(trigger,open);
 expect(captured).toBe(trigger);
 expect(order).toEqual(['focus','open']);
 expect(trigger.focus).toHaveBeenCalledTimes(1);
 expect(open).toHaveBeenCalledTimes(1);
});
