import type {CalendarRange} from '../productivity/calendarContracts.js';
import type {QueryClock,Quadrant} from '../productivity/contracts.js';
import type {Money} from '../wallet/contracts.js';
export interface FamilyDueItem {
 id:string;source:{kind:'walletSchedule';id:string};title:string;
 date:string;timezone:string;readOnly:true;kind:'income'|'expense'|'transfer';
 money:Money;accounts:{id:string;name:string}[];overdue:boolean;
}
export interface FamilyOverview {
 actorId:string;range:CalendarRange;clock:QueryClock;
 tasks:{active:number;myTasks:number;q2:number;waitingReview:number;blocked:number};
 taskItems:{ref:{kind:'task';id:string};title:string;revision:number;quadrant:Quadrant;pendingApproval:boolean;assigneeId:string|null}[];
 finance:{available:boolean;items:FamilyDueItem[];total:number};
}
