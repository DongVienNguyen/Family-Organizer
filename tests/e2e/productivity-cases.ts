import{registerProductivityOrdering}from'./productivity-order-cases.js';
import{registerProductivityViewEditor}from'./productivity-view-cases.js';
import type{createProductivityTest}from'./productivity-test.js';
import{registerProductivityCore}from'./productivity-core-cases.js';
import{registerProductivityAdvanced}from'./productivity-advanced-cases.js';
import{registerProductivityWorkflow}from'./productivity-workflow-cases.js';
import{registerProductivityColumns}from'./productivity-column-cases.js';
import{registerProductivityRoster}from'./productivity-roster-cases.js';
import{registerProductivityPolicy}from'./productivity-policy-cases.js';
import{registerProductivityCreate}from'./productivity-create-cases.js';
export{registerProductivityOrdering,registerProductivityViewEditor,registerProductivityCore,registerProductivityAdvanced,registerProductivityWorkflow,registerProductivityColumns,registerProductivityRoster,registerProductivityPolicy,registerProductivityCreate};
/** Keep workflow and column cases on the lighter worker; no existing case is omitted. */
export function registerProductivityCoreWithSupplemental(test:ReturnType<typeof createProductivityTest>){registerProductivityCore(test);registerProductivityWorkflow(test);registerProductivityColumns(test);registerProductivityRoster(test);registerProductivityPolicy(test);registerProductivityCreate(test);registerProductivityViewEditor(test);registerProductivityOrdering(test);}
/** One Chromium store retains the accepted C01..C42 registration order. */
export function registerProductivityChromium(test:ReturnType<typeof createProductivityTest>){registerProductivityCore(test);registerProductivityAdvanced(test);registerProductivityWorkflow(test);registerProductivityColumns(test);registerProductivityRoster(test);registerProductivityPolicy(test);registerProductivityCreate(test);registerProductivityViewEditor(test);registerProductivityOrdering(test);}
