import type {WalletTx} from './store.js';
import type {RuleCandidate} from '../../src/features/wallet/ruleContracts.js';
type Sql=WalletTx['sql'];
const enabled=(sql:Sql)=>!!sql.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wallet_rule_overrides'");
type Metadata={categoryId:string|null;labelIds:string[];reviewedAt:string|null};
/** Only actual manual field differences, within the existing I01 transaction.
 * Historical schema versions remain untouched; editing never migrates storage. */
export function markManualRuleChanges(sql:Sql,id:string,before:Metadata|null,after:Metadata){
 if(!enabled(sql))return;
 const category=before?before.categoryId!==after.categoryId:after.categoryId!==null;
 const labels=before?JSON.stringify([...before.labelIds].sort())!==JSON.stringify([...after.labelIds].sort()):after.labelIds.length>0;
 const reviewed=before?before.reviewedAt!==after.reviewedAt:after.reviewedAt!==null;
 if(!category&&!labels&&!reviewed)return;
 sql.run("INSERT INTO wallet_rule_overrides VALUES(?,?,?,?) ON CONFLICT(record_id) DO UPDATE SET category_origin=CASE WHEN ? THEN 'manual' ELSE category_origin END,labels_manual=max(labels_manual,excluded.labels_manual),review_manual=max(review_manual,excluded.review_manual)",id,category?'manual':before?.categoryId?'manual':'unclassified',Number(labels),Number(reviewed),Number(category));
}
export function readRuleOrigins(sql:Pick<Sql,'get'>,id:string,categoryId:string|null):Pick<RuleCandidate,'categoryOrigin'|'labelsManual'|'reviewManual'>{
 const row=sql.get('SELECT * FROM wallet_rule_overrides WHERE record_id=?',id);
 return {categoryOrigin:row?.category_origin??(categoryId===null?'unclassified':'manual'),labelsManual:!!row?.labels_manual,reviewManual:!!row?.review_manual};
}
/** Consume the bulk writer's exact staged metadata with one set-based query. */
export function markBulkManualRuleChanges(sql:Sql){
 if(!enabled(sql))return;
 sql.run(`INSERT INTO wallet_rule_overrides
 SELECT id,CASE WHEN json_extract(before_json,'$.categoryId') IS NOT json_extract(after_json,'$.categoryId') THEN 'manual' ELSE COALESCE((SELECT category_origin FROM wallet_rule_overrides WHERE record_id=w.id),CASE WHEN json_extract(before_json,'$.categoryId') IS NULL THEN 'unclassified' ELSE 'manual' END) END,
 json_extract(before_json,'$.labelIds') IS NOT json_extract(after_json,'$.labelIds'),0
 FROM temp.fo_wallet_bulk_work w WHERE json_extract(before_json,'$.categoryId') IS NOT json_extract(after_json,'$.categoryId') OR json_extract(before_json,'$.labelIds') IS NOT json_extract(after_json,'$.labelIds')
 ON CONFLICT(record_id) DO UPDATE SET category_origin=excluded.category_origin,labels_manual=max(labels_manual,excluded.labels_manual)`);
}
