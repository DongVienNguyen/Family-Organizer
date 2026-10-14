import type {UserRole} from '../../types.js';
export type Id=string;
/** Canonical signed64 integer string, never a JavaScript floating point amount. */
export type Minor=string;
export type CurrencyCode=string;
export type Money={minor:Minor;currency:CurrencyCode};
export type Actor={userId:Id;role:`${UserRole}`};
export type Revision=number;
export type CommandContext={actor:Actor;idempotencyKey:string;expectedRevision?:Revision};
export type Source='manual'|'import'|'schedule'|'legacy';
export type RecordKind='income'|'expense'|'transfer'|'adjustment'|'trade';
export type Settlement='uncleared'|'cleared'|'reconciled'|'voided';
export type Period={fromDate:string;toDateExclusive:string;timezone:string};
export type RecordFilter={period:Period;accountIds?:Id[];categoryIds?:Id[];labelIds?:Id[];labelMatch?:'any'|'all';currencies?:CurrencyCode[];kinds?:RecordKind[];statuses?:Settlement[];paymentMethods?:string[];creatorIds?:Id[];transferMode?:'include'|'exclude'|'only';query?:string;absoluteMin?:Minor;absoluteMax?:Minor;referenceCurrency:CurrencyCode};
export type Page<T>={items:T[];nextCursor:string|null;total:number};
export type DomainErrorCode='INVALID_INPUT'|'FORBIDDEN'|'NOT_FOUND'|'CONFLICT'|'RATE_UNAVAILABLE'|'LIMIT_EXCEEDED';
export type DomainError={code:DomainErrorCode;message:string;fields?:Record<string,string>;requestId?:string};
/** A read projection supplied only after account/record ACL by W04/W06. */
export type FilterRecord={id:Id;effectiveDate:string;accountIds:Id[];categoryId:Id|null;labelIds:Id[];currency:CurrencyCode;kind:RecordKind;status:Settlement;paymentMethod:string;creatorId:Id;searchText:string;minor:Minor};
export type CategoryNode={id:Id;parentId:Id|null};
