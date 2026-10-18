import {object,keys,integer,boolean} from '../productivity/validation.js';
import type {CatalogReferences} from '../../../server/wallet/catalog.js';
/** Only bounded counts and protection flags cross the error boundary. Never
 * accept arbitrary reference IDs, names, amounts or a hidden aggregate total. */
export function catalogReferencesValue(raw:unknown):CatalogReferences {
    const value=object(raw);keys(value,['children','records','allocations','history','otherRestricted']);integer(value.children,0,10000);integer(value.records,0,100000);integer(value.allocations,0,100000);boolean(value.history);boolean(value.otherRestricted);
    return {children:value.children,records:value.records,allocations:value.allocations,history:value.history,otherRestricted:value.otherRestricted};
}
