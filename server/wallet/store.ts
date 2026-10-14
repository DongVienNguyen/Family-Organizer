import type {withAppWriteTransaction,AppWriteMetadata} from '../appStore.js';
export function openWalletStore(_ports:{write:typeof withAppWriteTransaction}) {return {transaction<T>(_meta:AppWriteMetadata,_fn:(tx:any)=>T):T {throw Error('Wallet storage not implemented');}};}
