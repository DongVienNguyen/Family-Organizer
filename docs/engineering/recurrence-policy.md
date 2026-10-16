# Recurrence policy contract and rotation transitions (P10-c3)

The pure policy normalizer validates an explicit named timezone, due/completion
base, calendar cadence or fixed date list, an end variant, missed policy and
rotation member IDs. Calendar intervals1–366 and clamp/skip match the arithmetic
helpers. Fixed dates use their sorted/unique1–366-entry contract and cannot be
completion-based. End is never, a valid existing local date, or count1–100000.
Missed policy is explicitly skip/latest/catch_up. Unknown fields, duplicate or
empty rotation IDs and more than256members are refused. Normalized objects and
arrays do not alias caller data.

This is configuration validation only. It does not choose/materialize missed
occurrences, apply count/end to a schedule, validate actual user existence or
ACLs, store series, or activate runtime behavior. Creation/edit owners must
validate anchors and current canonical Task/member authority before persistence.

Rotation accepts a nonnegative safe monotonic cursor. Only the trusted owner of
a newly committed accepted-occurrence claim may use the accepted transition;
this helper does not deduplicate claims or establish completion authority. A new
accepted occurrence advances one cursor and wraps only the member selection.
Pending approval, skip, rejection and reopen preserve the cursor. Disabled
rotation preserves any prior cursor under every transition, so disabling it
cannot force a history rewind. A null result means rotation is disabled; it is
not an instruction to clear a canonical Task assignee. Overflow on an effective
advance is refused; no-op transitions at the maximum cursor remain valid.

One Important review finding corrected the initial disabled-rotation cursor0
requirement. All five transitions now preserve the prior cursor; the former
positive-cursor invalid fixture is reclassified to invalid NaN while retaining
all six invalid-state assertions. No assertions from existing application or
browser regression suites are removed. Domain and isolated offline cold imports
are mandatory in Windows quality evidence.

No Task/reward/job/series persistence, migration/default activation, dependency,
public integration API, release/tag or VPS behavior changes here. Full P10 and
actual Server2019/R02 acceptance remain separate work.
