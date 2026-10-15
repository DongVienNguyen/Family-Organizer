# P10 — characterized completion policy before cutover

The current canonical/legacy adapter requires approval only when the actor and
reward recipient are both children, points are positive and points exceed the
family threshold. At threshold5, child→child10 is pending with no points;
child→child5 is accepted, zero points are accepted, and adults completing for a
child follow the current immediate acceptance policy. Points are awarded only to
child recipients. A child cannot forge reward or assignee while submitting.
Pending approval does not create a recurring successor or rotate its assignee;
acceptance creates one successor and one reward. Rejection preserves proof/reason
without subtracting an ungranted reward. Snapshot restore preserves those states.

A material difference is now characterized: **current reopen keeps earned points**
and starts another round; completing that round can grant again. The approved
Productivity spec §8 and P10 target a linked compensating reversal on reopen.
This baseline test records the existing behavior and does not implement that new
policy or silently enable it. The P10 implementation must document both paths and
its controlled cutover; the spec requires admin policy review before release and
the plan requires review before pilot. Neither pilot activation nor release/VPS
execution is claimed by this characterization slice.

The independent source fixture currently passes10tests on Cloud with no live
provider delivery. Its first attempt failed before collecting any tests because
of a fixture import typo; that zero-test report is retained and is not validation.
No business code, settings default, points ledger schema or completion writer was
changed. Full P10 still requires semantic command ports, reversal/claim handling,
recurrence rules/virtual previews/exceptions/worker restart, HTTP and exact Windows
acceptance. P08/P09 workflow transitions consume those future shared commands.
