import{createProductivityTest}from'./productivity-test.js';
import{registerProductivityChromium}from'./productivity-cases.js';
registerProductivityChromium(createProductivityTest());
