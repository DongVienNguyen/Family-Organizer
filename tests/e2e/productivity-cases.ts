import type{createProductivityTest}from'./productivity-test.js';
import{registerProductivityCore}from'./productivity-core-cases.js';
import{registerProductivityAdvanced}from'./productivity-advanced-cases.js';
import{registerProductivityWorkflow}from'./productivity-workflow-cases.js';
import{registerProductivityColumns}from'./productivity-column-cases.js';
export{registerProductivityCore,registerProductivityAdvanced,registerProductivityWorkflow,registerProductivityColumns};
/** Keep workflow and column cases on the lighter worker; no existing case is omitted. */
export function registerProductivityCoreWithSupplemental(test:ReturnType<typeof createProductivityTest>){registerProductivityCore(test);registerProductivityWorkflow(test);registerProductivityColumns(test);}
/** One Chromium store retains the accepted C01..C42 registration order. */
export function registerProductivityChromium(test:ReturnType<typeof createProductivityTest>){registerProductivityCore(test);registerProductivityAdvanced(test);registerProductivityWorkflow(test);registerProductivityColumns(test);}
