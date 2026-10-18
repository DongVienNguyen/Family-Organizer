# P13 personal task templates

Source3ee1d5d implements the template slice of P13. Explicit pilot schema15 adds
one owner-scoped content table. Default6 and package caps are unchanged; frozen
1–14 migration SQL/checksums remain. Notes/conversion/files/import/export are
still separate P13 work, not implied by this checkpoint.

The Task drawer saves title, Markdown, priority and checklist labels. A reviewed
destination creates a private unfinished Task with fresh Task/history/check-item
IDs, unchecked checklist, no date/assignee/reward/proof/completion/recurrence/tag
copy. The source remains unchanged. Current owner/source/destination authority
is checked before the shared I01 receipt and within its transaction. Revoked or
deleted sources hide templates without leaking body/counts. Tombstone deletion
is owner-only and retry-safe. Lists return at most100 summaries; only the selected
body loads. Media inheritance uses an explicit trusted capability from current
source references, so old templates cannot resurrect removed attachments.

The existing user session owns original nonce/revisions/payload across lost ACK,
SSE and navigation. Current source/destination visibility loss and logout retire
private intent and fence late effects. Library expansion also survives an SSE
remount; the first actual browser failure and one native RED are retained.

Full8595tests526files/matching JUnit passed at ceafc79 (all8560parents retained,
plus media2 and templates33). A subsequent UI panel-state fix at3ee1d5d has all34
focused template cases, lint/build0 and14 first-attempt Chromium journeys:
templates3 + notifications4 + collaboration3 + calendar4. All share the exact
3ee1d5d build; owned15/14/13/13 fixtures, offline boundary, normal stop, integrity,
closed handles and cleanup pass. Both390px template themes were viewed. No full-
suite claim is made for3ee1d5d. [Raw proof](evidence/p13-templates-development.json).

No new-source PR or Windows run yet. Final composed Windows qualification must
include all prior Productivity/touch/Wallet browser suites, three engines,
Node22/24/package/service/performance and the new feature harnesses (not yet wired).
Actual Server2019 R02 remains separate; no release/tag/VPS/PC runner.
