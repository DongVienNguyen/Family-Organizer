import fs from 'node:fs';
import assert from 'node:assert/strict';
import {renderServiceConfiguration} from './service-config.mjs';
const [releaseRoot,instanceRoot,serviceId,port,xmlPath,configPath]=process.argv.slice(2);
assert.equal(fs.readFileSync(xmlPath,'utf8'),renderServiceConfiguration({releaseRoot,instanceRoot,serviceId,port:Number(port)}),'Installed XML differs from authenticated canonical configuration');
assert.equal(fs.readFileSync(configPath,'utf8'),'<configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8"/></startup></configuration>\n','Installed CLR config differs from authenticated runtime configuration');
