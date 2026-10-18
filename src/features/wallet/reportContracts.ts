import type {RecordFilter} from './contracts.js';
export type ReportMetric='incomeExpense'|'balance'|'cashflow'|'cumulativeCashflow';
export type ReportGroup='none'|'account'|'category'|'label'|'creator';
export type ReportGranularity='day'|'week'|'month'|'year';
export interface ReportInput {filter:RecordFilter;metric:ReportMetric;groupBy:ReportGroup;granularity:ReportGranularity}
export interface ReportAmounts {incomeMinor:string;expenseMinor:string;netMinor:string;movementMinor:string;adjustmentMinor:string;valueMinor:string}
export interface ReportPoint extends ReportAmounts {groupId:string|null;period:{fromDate:string;toDateExclusive:string};drilldownFilter:RecordFilter}
export interface ReportResult {metric:ReportMetric;groupBy:ReportGroup;granularity:ReportGranularity;referenceCurrency:string;series:ReportPoint[];drilldownFilters:{total:RecordFilter};totals:ReportAmounts;coverage:{complete:boolean;valuedPostings:number;totalPostings:number;partialRecords:number;matchedRecords:number;missingRates:{currency:string;date:string;postings:number}[];quotes:{fromCurrency:string;toCurrency:string;asOf:string;source:string}[]};comparison:{complete:boolean;previous:ReportAmounts;changeRatio:{numerator:string;denominator:string}|null};groupsOverlap:boolean;ignoredFilters:string[];formulaVersion:'wallet-reports-v1';asOf:string}
