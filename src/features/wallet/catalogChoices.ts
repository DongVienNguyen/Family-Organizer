import type {WalletCategoryView} from '../../../server/wallet/catalogView.js';
/** Definition visibility is inherited for new assignments. Keep the full catalog
 * for historical display/filtering; no source node is rewritten or removed. */
export function categorySelectability(categories:readonly WalletCategoryView[]):(id:string)=>boolean {
    const byId=new Map(categories.map(row=>[row.id,row])),memo=new Map<string,boolean>();
    return (id:string)=>{
        if(memo.has(id))return memo.get(id)!;
        const path:WalletCategoryView[]=[],seen=new Set<string>();let current:string|null=id,active=true;
        while(current!==null){if(memo.has(current)){active=memo.get(current)!;break;}if(seen.has(current)){active=false;break;}seen.add(current);const row=byId.get(current);if(!row){active=false;break;}path.push(row);current=row.parentId;}
        for(let index=path.length-1;index>=0;index--){const row=path[index];active=active&&!row.hidden&&row.archivedAt===null;memo.set(row.id,active);}
        return memo.get(id)??false;
    };
}
/** Exclude the edited subtree in one pass, including imported deep trees. */
export function catalogParents<T extends {id:string;parentId:string|null}>(categories:readonly T[],self?:string):T[]{
 if(!self)return [...categories];const children=new Map<string,string[]>();for(const item of categories)if(item.parentId){const rows=children.get(item.parentId)??[];rows.push(item.id);children.set(item.parentId,rows);}const excluded=new Set<string>(),queue=[self];for(let index=0;index<queue.length;index++){const id=queue[index];if(excluded.has(id))continue;excluded.add(id);queue.push(...children.get(id)??[]);}return categories.filter(item=>!excluded.has(item.id));
}
