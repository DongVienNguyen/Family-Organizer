# Matrix client preparation (P07-a)

The existing internal session transport now exposes Matrix projection, preview,
apply and reset-pin methods. Requests use no-store, existing authentication and
AbortSignal; mutation keys belong to the caller. Only supported intent fields are
sent. Caller clocks, actor overrides and unrelated Task fields are refused.

Responses are validated before display: canonical task IDs and curated fields,
unique counts/placements, complete match diagnostics, current pins, captured
clock/revisions, coherent before/after patch and explicit deadline warnings.
Projection records do not establish editor visibility or replace TaskCache. The
existing canonical open/refresh path remains necessary when P07-b opens a drawer.

`createMatrixState` owns one selected projection and one captured preview. It
makes no optimistic task move. Cancel aborts a pending preview and sends no
mutation. Apply requires explicit deadline confirmation and a resolved custom
choice; only the server decides the effective target and five-minute expiry.
Previews inherit the selected projection timezone; a conflicting intent timezone
is refused before transport. Unpinned placements must match the first rule match,
with empty matches for the unmatched tray; explicit pins may override placement.
Metadata refresh preserves the captured preview/revision rather than rebasing
it. HTTP409 retains the preview and blocks apply until an explicit new preview.

A lost response retains the complete packet and command key for an explicit
retry; there is no automatic retry/offline queue. While a write is outstanding,
cancel/double-submit are refused. An unrelated failed read cannot unlock that
write. Successful writes publish the authoritative result and refresh only this
projection; P07-b must separately refresh the full authorized cache. A failed
projection refresh after known success never reopens its old confirmation.

View/session changes abort pending requests and retire their generation. Late
responses cannot publish old private rows or mutation results. Auth/visibility
refusals clear retained rows, preview and result. Dispose retires subscriptions
and imports start no timers/storage. Server-side ACL, revisions and I01 remain
authoritative even when a request was already sent before cancellation.

This slice adds no Matrix UI, drag library, schema, default activation or runtime
dependency. P07-b owns Matrix/editor/confirmation, keyboard/pointer/touch,
390/768/desktop, light/dark/reduced-motion and native browser flows. FullP07 is
not accepted by this preparation slice. Actual Server2019/R02 remains unrun.
