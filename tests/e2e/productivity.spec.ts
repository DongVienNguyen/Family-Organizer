import{createProductivityTest}from'./productivity-test.js';
import{registerProductivityCore}from'./productivity-core-cases.js';
registerProductivityCore(createProductivityTest());
