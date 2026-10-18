import {runProductivityFeatureBrowser} from './productivity-feature-browser.mjs';
if(process.argv.length!==3)throw Error('Explicit Calendar browser project required');
await runProductivityFeatureBrowser('calendar',process.argv[2]);
