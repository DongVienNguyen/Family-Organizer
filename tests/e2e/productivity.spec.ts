import{createProductivityTest}from'./productivity-test.js';
import{registerProductivityCoreWithWorkflow}from'./productivity-cases.js';
registerProductivityCoreWithWorkflow(createProductivityTest());
