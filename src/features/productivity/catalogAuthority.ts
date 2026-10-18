export type CatalogScope={id:string;permission?:string};
export interface CatalogAuthority {subscribe(listener:(scopes:CatalogScope[])=>void):()=>void}
/** Called on a fresh authenticated catalog result, before slower auxiliary reads.
 * No titles or Task data are retained; transient refresh starts publish nothing. */
export function createCatalogAuthority():CatalogAuthority&{confirm(scopes:CatalogScope[]):void;dispose():void}{
 let disposed=false;const listeners=new Set<(scopes:CatalogScope[])=>void>();
 return {subscribe(listener){if(disposed)return()=>{};listeners.add(listener);return()=>{listeners.delete(listener);};},confirm(scopes){if(disposed)return;const safe=scopes.map(({id,permission})=>({id,...(permission===undefined?{}:{permission})}));for(const l of listeners)l(structuredClone(safe));},dispose(){disposed=true;listeners.clear();}};
}
export function watchCatalogScope(authority:CatalogAuthority,ports:{scope():string[];accepts(list:CatalogScope):boolean;onRevoked():void}):()=>void{
 return authority.subscribe(lists=>{if(ports.scope().some(id=>!lists.some(l=>l.id===id&&ports.accepts(l))))ports.onRevoked();});
}
