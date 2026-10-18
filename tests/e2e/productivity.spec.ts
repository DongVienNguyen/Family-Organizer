import{createProductivityTest}from'./productivity-test.js';
import{registerProductivityCoreWithSupplemental}from'./productivity-cases.js';
registerProductivityCoreWithSupplemental(createProductivityTest());
