# Scoped record filter controls — W04/W06 partial

Source `1cd381720c9b219df6c0b07342f9da2ed750a147` adds the remaining shared filter dimensions: record type,
settlement status, currency, creator, payment method and label any/all. Existing
period/query/account/category/labels/transfer/reference amount filters remain.
Week/month/year buttons resolve the named-zone calendar; custom dates and exact
localized amount input remain explicit. Removing the final checkbox removes that
restriction, while an explicit empty server array still means zero matches.
Normal reset restores the default month/nonvoided view without duplicating the
existing error recovery control. No new query/filter implementation is added.

Creator/payment method options are an authenticated internal read, scoped to
currently readable records before selecting values. Partial transfers never
contribute free-text payment methods. Historical known creators remain selectable
regardless of their current role/deletion; the caller must still be a current
adult with current grants. Before/after account permission and record
revision/visibility fingerprints reject scope changes between queries. Missing
readable metadata and over10000 option cardinality fail explicitly. No amounts,
record text, private methods or unrelated credentials enter the response.

The browser decoder validates unique bounded choices. The existing session owner
clears visible choices synchronously during refresh, on failure and at disposal;
late responses cannot cross a retired session. Filter controls preserve the
existing pending/unknown write safeguards. Combined filters retain OR within one
dimension and AND between dimensions. Input above Number.MAX_SAFE_INTEGER remains
an exact integer string; changing reference currency cannot retain stale bounds.
Controls wrap at phone width and retain keyboard focus order.

Cloud7173tests/387files/matchingJUnit, zero failed/skipped/todo, all7130parent
retained+43 (13native policy,1HTTP,8SDK,17draft,4workspace). Lint/build exit0;
Chromium15/15 includes prior14 plus real combined-filter payload/results, label
any/all, clearing the final facet, reset,390px width and keyboard navigation.
Synthetic seeded label choices are limited to the explicit Wallet5 browser
fixture; the older default Wallet4 fixture remains supported. Real Express/SQLite,
integrityOK, legacy kept, normal stop and zero external attempts. The current
source/build/browser were unchanged, so build/browser were run once for this
group; full regression ran once. No assertions/skips/retries/timeouts were relaxed.

[Proof](evidence/w06-filter-controls-development.json),
[full compressed JUnit](evidence/w06-filter-controls-cloud.junit.xml.gz),
[browser cases](evidence/w06-filter-controls-browser.junit.xml).
Author inspection18paths is not independent whole-branch review. PR/CI URLs:none;
backup branch `codex/feature-first-acceptance`. Current Windows2022/Node22, other
engines/touch,100000-row Windows performance, package/service and actual
Server2019R02 are unrun. No dependency/lock/workflow/release/tag/VPS change.

W06 still needs durable cross-page selection and atomic bulk metadata. Saved
filters/preferences, broad integration/performance and the remaining Wallet/M1/
I02/I03/master gates remain mandatory. Receipt live apply/financial remediation/
raw JSON ZIP/legacy bridge/cutover/retention remain unfinished; Wallet stays off.
This checkpoint completes the scoped filter controls, not W04/W06 or the plan.
