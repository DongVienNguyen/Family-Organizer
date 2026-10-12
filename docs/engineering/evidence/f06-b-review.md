# F06-b single fresh whole-branch review

Reviewed BASE8a898259cc1fd9d1e66921e480614c6be14c057c..HEADdc76fc0796cdb6dc4230c0249bcda2acc5120cf1 read-only by the required fresh reviewer. No Critical; two Important and two Minor. All findings graded ACCEPT before source corrections. One TDD correction pass; no re-review.

- Important: relative OutputDirectory changes meaning after staging Push-Location; resolve it to an absolute path and test the actual workflow invocation.
- Important: declared ZIP sizes alone do not bound decompressor output; counted copy must refuse bytes before exceeding declared/per-file/aggregate budgets. Add malformed-header PS5.1 regression.
- Minor: Windows COM/LPT superscript1–3 aliases need rejection in both preflight validators and PS fixtures.
- Minor: producer execution/native/cleanup evidence must be emitted from finally on success and failure and not mask original errors.

Review declined F07 full service/encryption, release/VPS/Server2019 acceptance and disclosed license-text finding resolution. Exact-HEAD Windows logs/artifacts remain a separate mandatory author verification.
