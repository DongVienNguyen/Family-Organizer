import {it,expect} from 'vitest';
import {createWalletApi} from './api.js';
const valid={creators:[{id:'synthetic-adult',name:'Synthetic adult'}],paymentMethods:['Synthetic cash']};
function client(value:unknown){return createWalletApi({authHeaders:()=>({Authorization:'Bearer synthetic-only'}),request:async path=>{expect(path).toBe('/api/wallet/record-filter-options');return Response.json(value);}}) as any;}
it('decodes scoped facet choices and drops unrelated financial/token fields',async()=>{expect(await client({...valid,openingMinor:'123',token:'synthetic-excluded'}).filterOptions()).toEqual(valid);});
it.each([{creators:null},{creators:[{id:'',name:'Synthetic'}]},{creators:[{id:'synthetic',name:''}]},{creators:[{id:'same',name:'One'},{id:'same',name:'Two'}]},{paymentMethods:[123]},{paymentMethods:['']},{paymentMethods:['duplicate','duplicate']}])('refuses malformed filter metadata %j',async patch=>{await expect(client({...valid,...patch}).filterOptions()).rejects.toMatchObject({code:'INVALID_RESPONSE',unknownOutcome:false});});
