import type{createProductivityTest}from'./productivity-test.js';
import{registerProductivityCore}from'./productivity-core-cases.js';
import{registerProductivityAdvanced}from'./productivity-advanced-cases.js';
import{registerProductivityWorkflow}from'./productivity-workflow-cases.js';
export{registerProductivityCore,registerProductivityAdvanced,registerProductivityWorkflow};
/** Keep new workflow cases on the lighter worker; no existing case is omitted. */
export function registerProductivityCoreWithWorkflow(test:ReturnType<typeof createProductivityTest>){registerProductivityCore(test);registerProductivityWorkflow(test);}
/** One Chromium store retains the accepted C01..C35 registration order. */
export function registerProductivityChromium(test:ReturnType<typeof createProductivityTest>){registerProductivityCore(test);registerProductivityAdvanced(test);registerProductivityWorkflow(test);}
