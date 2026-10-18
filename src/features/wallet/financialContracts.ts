import type {Money} from './contracts.js';
import type {TrackingAmount} from './linkedMoney.js';
export interface FinancialHistory {id:string;amount:TrackingAmount;date:string;note?:string;byId:string;createdAt:string}
export interface DebtTarget {id:string;name:string;direction:'borrowed'|'lent';parentHash:string;remaining:Money;payments:FinancialHistory[]}
export interface GoalTarget {id:string;name:string;parentHash:string;target:Money;contributions:FinancialHistory[]}
export interface FinancialTargets {debts:DebtTarget[];goals:GoalTarget[]}
interface LinkedInput {parentHash:string;date:string;timezone:string;note?:string;recordId?:string;recordRevision?:number}
export interface DebtPaymentInput extends LinkedInput {principal:Money;interest:Money;accountId:string;counterAccountId?:string;interestCategoryId?:string|null;existingPaymentId?:string}
export interface GoalContributionInput extends LinkedInput {mode:'allocation'|'transfer';money:Money;fromAccountId:string;toAccountId?:string;strict?:boolean;existingContributionId?:string}
export type FinancialPatch={principal?:Money;interest?:Money;money?:Money;date?:string;timezone?:string;note?:string;interestCategoryId?:string|null};
