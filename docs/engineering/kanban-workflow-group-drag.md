# Workflow and grouped Kanban drag

Cloud functional checkpoint, 2026-10-17 (Asia/Saigon), source `3560e03693233c4542800230ff3e12a63da8e02c`,
based on `ef0ed4b352e779a35e3a75f7217a9d2530f74d47`.

Active Workflow cards have a dedicated handle. Dropping onto Todo/Doing/Waiting
opens the existing P10 transition form with the target selected. Dropping onto
Done opens the existing completion/proof form. Neither drop sends a preview or a
mutation automatically: the user still explicitly previews and confirms. Derived
Review/Won't Do/trash targets and pending/terminal/ineligible sources cannot
produce these intents. The original menu controls remain available.

Grouped handles use distinct visual projection IDs, retaining the canonical Task
ID. A drop selects one source group and a current destination, then opens the
existing selected-dimension confirmation. Tag A→C replaces only A, preserves B,
and never infers All-tags add/replace. Due/priority/assignee follow their existing
explicit semantic form. Created/modified/derived-overdue groups are rejected by
the adapter. Canceled, foreign, stale or mismatched operations are rejected before
opening a form. These are frontend intents; server ACL/revision/P10/I01 authority
remains unchanged.

A visible-only overlay uses current authorized Task titles. Reduced motion
removes its drop animation. The locked library's existing default AutoScroller is
retained. The native Workflow journey explicitly asserts that dragging to Done at
1280px exercised auto-scroll. Handles remain separate from Task/open/menu buttons.
Existing Section drag and the combined native Matrix/Section touch assertions
are preserved.

Development verification first observed47missing-adapter RED cases and5new UI
behavior failures;6readonly characterizations already passed. Native C55/C56
failed on the previous production bundle because handles did not exist. The new
C56 initially compared a creation receipt's tag order with canonical read order;
its fixture now captures the full canonical baseline before the gesture and
keeps exact cancel equality. Three derived-group guards were causally RED→GREEN.
No assertions, retries, skips or timeouts were relaxed.

Full Cloud6369tests/343files/matchingJUnit/0failed-skipped-todo; lint/build0.
All6300parent tests remain+69new, normalizing only fresh temporary roots in the
five unchanged recovery-retention names and retaining multiplicity. Actual
Chromium C18/C24/C35/C36/C48/C50/C53–C56 and retained native touch pass10+1first
attempts, offline, with integrity, native close and cleanup. Workflow cancel
writes nothing; actual child Done becomes Review/zero points; adult approval and
UUID replay produce one35point grant. Multi-tag apply changes only the selected
tag/revision, retaining timed deadline/lifecycle/rewards and unique projections.
Grouped dark/reduced-motion1280px and390px/no-overflow screenshots are retained;
the mobile screenshot was visually inspected. One LOCAL SELF14paths0C/0I/0M,
no correction/rereview, not independent.

[Compact evidence](evidence/m1-cross-drag-development.json) binds the frozen source,
production bundles and raw JSON/JUnit/log/image hashes. The runner recorded the
precommit HEAD while testing the working tree; this is not exact-HEAD Windows
acceptance. Original54case bodies, touch, offline guards, dependencies, schema,
workflows and runtime defaults remain unchanged. The new56-case source contract
requires168engine cases; old162-case raw reports remain historical.

PR URL/CI run URL:none. Full56-case browser inventory, Firefox/WebKit, dedicated
new Workflow/group native touch gestures and current Windows/package/service
qualification remain unrun; Server2019 is separate R02. No release/tag/VPS.

The main M1 core flows are functionally developed in Cloud. Full M1/P09/P17/P18
and the master are not complete. Continue Wallet core in dependency order under
the user's main-feature priority, keeping the remaining board pins/filtered-out
feedback/semantic undo, new-kind touch, large-list and final acceptance work in
[the checklist](m1-feature-checklist.md).
