import type{createProductivityTest}from'./productivity-test.js';
import{registerProductivityCore}from'./productivity-core-cases.js';
import{registerProductivityAdvanced}from'./productivity-advanced-cases.js';
export{registerProductivityCore,registerProductivityAdvanced};
/** One Chromium store retains the accepted C01..C35 registration order. */
export function registerProductivityChromium(test:ReturnType<typeof createProductivityTest>){registerProductivityCore(test);registerProductivityAdvanced(test);}
