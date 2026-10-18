import {runProductivityFeatureBrowser} from './productivity-feature-browser.mjs';
if(process.argv.length!==3)throw Error('Explicit notification browser project required');
await runProductivityFeatureBrowser('notifications',process.argv[2]);
