# Selection and bulk workflows — W04/W06 partial

Source `c78dde44bdfdd281cd32faf4d9f58ee4bec1c5ab` connects the [server/SDK foundation](wallet-bulk-foundation.md)
to Records. Checkboxes retain explicit loaded IDs and expected revisions. The
separate all-matching action captures a durable server selection; page membership
comes from that snapshot, so later matching records are unchecked. Users can
explicitly exclude captured IDs and see exact selected counts for either scope.
New capture/clear releases resolved nonfinancial staging; expiry still bounds
abandoned stages. No private/read-only/unsupported rows are silently omitted.
Server validation remains authoritative and rejects the whole invalid selection.

The inline form opts into category, labels, status, payee or note; unchecked fields
stay unchanged, empty values clear and labels replace the set. Shared FancySelect,
useConfirm, theme tokens and vi/en/zh resources are reused. Preview shows exact
matched/updated/unchanged counts and bounded before/after samples. Confirmation
uses the private cloned preview intent; draft, selection and read-view changes
invalidate it. Stale confirmation cannot send a replacement write. Money and
transfer counterparties are absent from this metadata-only form.

The owner lives above Finance tabs and uses the existing memory-only command
state. Unknown capture/apply retains original input and nonce, blocks Records
writes/filter/selection replacement, and only explicit same-key retry can resolve
it. A later403 remains unknown. Ordinary pending/form states block new bulk work.
Success clears selection/draft after acknowledgement and refreshes records;
compact counts remain visible. Refresh clears sample bodies/membership immediately
and generation guards drop late data.403/404 retires the whole selected financial
view. Session disposal purges IDs/draft/preview/private intent and ignores late
results. Nothing enters localStorage or an offline financial queue.

Native browser coverage checks two loaded selections versus a51-record captured
scope across pages, a52nd matching record remaining excluded, exact51-row update
and unchanged money/revisions for the late row. Other journeys prove a committed
lost acknowledgement survives tab navigation and replays the identical payload/
nonce once, and an independent edit invalidates an open confirmation while keeping
its draft. A held privacy refresh confirms the modal stays present until Escape
releases focus/scroll ownership; transaction samples remain hidden during refresh.
Phone390px wrapping, keyboard and both theme contrast checks are included.
The saved element screenshots show the visible scroll-container portion rather
than a complete long panel; click/keyboard assertions exercise its final action.

The initial browser attempt passed17/18; the last case retained the correct draft
but exact label lookup failed after textarea contents entered its wrapping label
text. Trace DOM plus a separate native synthetic diagnostic reproduced exact-label
0/AX1 before and1/1 after a separate associated label. The markup was fixed;
selectors, assertions, retries and deadlines were retained. A fourth new journey
was added for confirmation ownership during held revalidation. The failed trace/
DOM/video and logs remain indexed in the proof. No test was skipped or weakened.

Final Cloud7296tests/395files/matchingJUnit,0fail/skip/todo,
all7277parent cases retained+19. Lint/build0; Chromium19/19
preserves all15parent and all18first-attempt case names, with zero flaky/skipped/
external attempts, integrityOK, legacy kept, normal stop and closed handles.
Explicit synthetic schema6 powers the browser group; default4 and receipt5 fixture
tests remain. Final source/build hashes match the run. Full regression ran once
for final source; build/browser repetition followed actual fixes.

[Proof](evidence/w06-bulk-ui-development.json),
[full JUnit](evidence/w06-bulk-ui-cloud.junit.xml.gz),
[full log](evidence/w06-bulk-ui-cloud.log.gz),
[browser cases](evidence/w06-bulk-ui-browser.junit.xml),
[native label diagnostic](evidence/w06-bulk-ui-label-native-diagnostic.json).
Author14path inspection is not independent whole-branch review. PR/CI URLs:none;
backup branch `codex/feature-first-acceptance`. Current Windows2022/Node22, other
engines/native touch, large performance, package/service and actual Server2019R02
are unrun. No dependency/lock/workflow/release/tag/VPS change.

W06 still needs saved filters/preferences and remaining applicable acceptance.
Live receipt apply/remediation/raw backup/legacy bridge/cutover/retention and all
other Wallet/M1/I02/I03/master gates remain. Wallet stays off by default; this
checkpoint completes basic selection/bulk workflows, not W04/W06 or the plan.
