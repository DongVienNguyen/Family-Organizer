import {createHash} from 'node:crypto';
export type WalletBudgetWork={type:'budget-scan';key:string;payload:{budgetId:string;revision:number;epoch:string}}|{type:'budget-alert';key:string;payload:{claimId:string;epoch:string}};
export const walletBudgetAlertId=(claimId:string,recipientId:string)=>'wallet-budget-'+createHash('sha256').update(JSON.stringify([claimId,recipientId])).digest('hex');
