import fs from 'node:fs';
import {renderServiceConfiguration} from './service-config.mjs';
const [releaseRoot,instanceRoot,serviceId,port,output]=process.argv.slice(2);
fs.writeFileSync(output,renderServiceConfiguration({releaseRoot,instanceRoot,serviceId,port:Number(port)}),{encoding:'utf8',flag:'wx'});
