import {object,keys,text,integer} from '../../src/features/productivity/validation.js';
export interface BoardPosition {taskId:string;rank:number}
export interface BoardRankPlan {taskId:string;rank:number;orderedTaskIds:string[];rebalance:BoardPosition[]}
export const boardRankGap=1024;
/** Pure plan only; a trusted consumer must validate lane membership/revisions and
 * commit every returned position in the same I01 transaction. */
export function planBoardRank(input:{positions:readonly BoardPosition[];taskId:string;beforeTaskId:string|null}):BoardRankPlan {
 const packet=object(input);keys(packet,['positions','taskId','beforeTaskId']);text(input.taskId,256);
 if(input.beforeTaskId!==null)text(input.beforeTaskId,256);
 if(input.beforeTaskId===input.taskId)throw Error('A task cannot be its own rank anchor');
 if(!Array.isArray(input.positions)||input.positions.length>100000)throw Error('Invalid target lane positions');
 const ids=new Set<string>(),positions=input.positions.map(value=>{const row=object(value);keys(row,['taskId','rank']);text(row.taskId,256);integer(row.rank);if(ids.has(row.taskId))throw Error('Duplicate rank identity');ids.add(row.taskId);return {taskId:row.taskId,rank:row.rank};}).sort((a,b)=>a.rank-b.rank||(a.taskId<b.taskId?-1:a.taskId>b.taskId?1:0));
 const current=positions.find(row=>row.taskId===input.taskId),target=positions.filter(row=>row.taskId!==input.taskId),at=input.beforeTaskId===null?target.length:target.findIndex(row=>row.taskId===input.beforeTaskId);
 if(at<0)throw Error('Rank anchor is not in the target lane');
 const orderedTaskIds=target.map(row=>row.taskId);orderedTaskIds.splice(at,0,input.taskId);
 if(current&&orderedTaskIds.every((id,i)=>positions[i]?.taskId===id))return {taskId:input.taskId,rank:current.rank,orderedTaskIds,rebalance:[]};
 const left=target[at-1]?.rank,right=target[at]?.rank;let rank:number|undefined;
 if(left===undefined&&right===undefined)rank=boardRankGap;
 else if(left===undefined&&right!==undefined&&right>0)rank=right>=boardRankGap?right-boardRankGap:Math.floor(right/2);
 else if(right===undefined&&left!==undefined&&left<=Number.MAX_SAFE_INTEGER-boardRankGap)rank=left+boardRankGap;
 else if(left!==undefined&&right!==undefined&&right-left>1)rank=left+Math.floor((right-left)/2);
 if(rank!==undefined)return {taskId:input.taskId,rank,orderedTaskIds,rebalance:[]};
 const rebalance=orderedTaskIds.map((taskId,i)=>({taskId,rank:(i+1)*boardRankGap}));
 return {taskId:input.taskId,rank:rebalance[at].rank,orderedTaskIds,rebalance};
}
