import path from 'node:path';
import {safeArchivePath} from './package-contract.mjs';
export const caddyRuntime=Object.freeze({version:'2.11.7',platform:'win32',architecture:'x64',zipUrl:'https://github.com/caddyserver/caddy/releases/download/v2.11.7/caddy_2.11.7_windows_amd64.zip',zipSha256:'0a1edc0b799512051c57071ce0e798d3f2cf67dc98171366f1d2b326072e3b06',zipSha512:'c308154504e53755958ffc62d8a2657ab17eefd6dd25c45dbb2c3d93d29519971f77ca652f7d0f2bcb7f980b9ba3822478865e29969d0272d7613550a43152b1',binarySha256:'5f93a9bd555f3aac9d33af2756ba14b3519d8cca4ffd55256bdaeab444c9db2a',licenseSha256:'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'});
export function syntheticCaddyConfiguration(options){
 const reject=()=>{throw new Error('CADDY_FIXTURE_REJECTED');};
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).sort().join(',')!=='adminPort,backendPort,fixtureRoot,httpsPort')reject();
 const {backendPort,httpsPort,adminPort,fixtureRoot}=options;
 const ports=[backendPort,httpsPort,adminPort];if(!ports.every(p=>Number.isSafeInteger(p)&&p>=1024&&p<=65535)||new Set(ports).size!==3)reject();
 if(typeof fixtureRoot!=='string'||!/^([a-z]):\\/i.test(fixtureRoot)||path.win32.normalize(fixtureRoot)!==fixtureRoot||!safeArchivePath(fixtureRoot.slice(3).replaceAll('\\','/')))reject();
 return {
  admin:{listen:'127.0.0.1:'+adminPort,enforce_origin:true,origins:['127.0.0.1:'+adminPort]},
  storage:{module:'file_system',root:path.win32.join(fixtureRoot,'caddy storage')},
  apps:{
   pki:{certificate_authorities:{synthetic:{name:'Synthetic CI CA',root_common_name:'Synthetic CI Root',intermediate_common_name:'Synthetic CI Intermediate',install_trust:false}}},
   tls:{automation:{policies:[{subjects:['localhost'],issuers:[{module:'internal',ca:'synthetic'}]}]}},
   http:{servers:{synthetic:{listen:['127.0.0.1:'+httpsPort],automatic_https:{disable_redirects:true},tls_connection_policies:[{}],routes:[{match:[{host:['localhost']}],handle:[{handler:'reverse_proxy',upstreams:[{dial:'127.0.0.1:'+backendPort}]}]}]}}},
  },
 };
}
