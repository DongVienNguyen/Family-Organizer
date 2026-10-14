import type {AppWriteTx} from '../appStore.js';
import {productivityTables} from './schema.js';
export function exportProductivitySnapshot(tx:AppWriteTx):Record<string,unknown[]> {
 return Object.fromEntries(Object.entries(productivityTables).map(([name,columns])=>[name,tx.all(`SELECT ${columns.join(',')} FROM ${name}`)]));
}
