import {runProductivityFeatureBrowser} from './productivity-feature-browser.mjs';
if(process.argv.length!==3)throw Error('Explicit collaboration browser project required');
await runProductivityFeatureBrowser('collaboration',process.argv[2]);
