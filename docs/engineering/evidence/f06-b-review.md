# F06-b single fresh whole-branch review

Reviewed BASE8a898259cc1fd9d1e66921e480614c6be14c057c..HEADdc76fc0796cdb6dc4230c0249bcda2acc5120cf1 read-only by the required fresh reviewer. No Critical; two Important and two Minor. All findings graded ACCEPT before source corrections. One TDD correction pass; no re-review.

- Important: relative OutputDirectory changes meaning after staging Push-Location; resolve it to an absolute path and test the actual workflow invocation.
- Important: declared ZIP sizes alone do not bound decompressor output; counted copy must refuse bytes before exceeding declared/per-file/aggregate budgets. Add malformed-header PS5.1 regression.
- Minor: Windows COM/LPT superscript1–3 aliases need rejection in both preflight validators and PS fixtures.
- Minor: producer execution/native/cleanup evidence must be emitted from finally on success and failure and not mask original errors.

Review declined F07 full service/encryption, release/VPS/Server2019 acceptance and disclosed license-text finding resolution. Exact-HEAD Windows logs/artifacts remain a separate mandatory author verification.

Correction evidence underway:
- Six superscript device cases witnessed actual RED in Cloud (62passed/6failed), then corrected helper/metadata suite GREEN.
- First Windows source run38197262191: both quality1311/82/all8checks0/audit0/23compiledproof/sevenincompatible schemas,15first-attempt browsers and104coverage files independently verified; producer failed missing System.IO.Compression assembly under Windows PowerShell5.1, consumer not run. Added explicit assembly load, retained full native failure proof.
- First native-regression run38197537864: actual PS5.1 fixture failed querying Sum on an empty file enumeration; fixed fixture to count file bytes explicitly. This failure is not misrepresented as the intended forged-length RED proof.
- New run38197846395 tests the unchanged vulnerable extractor against corrected native fixtures; Actual report independently read: seven failures; forged1-byte length wrote2097152bytes, six device aliases created extraction paths.26fixtures plus safeUnicode positive; raw hash evidence in f06-b-archive-regressions.json.
- Corrections resolve relative report root, enforce actual decompressed byte limits before writing and clean only newly owned extraction paths, reject superscript device aliases, and emit native/stage/cleanup producer report on failure. An actual wrong-SHA producer refusal fixture and normal relative workflow invocation must both pass.

- Corrected source1b41ab8/run38198214914: all26 native malicious archives rejected with no residual bytes and Unicode positive. Wrong-SHA producer exited1, git0/unreached stagesnull and cleanuptrue; independently read both actual reports. The workflow step still failed because Actions' pwsh wrapper propagated residual LASTEXITCODE1 after all expected-refusal assertions. Added explicit exit0 only after exact native1 and structured failure/cleanup assertions pass; no assertions removed or continue-on-error. Normal ZIP producer/consumer still pending.
