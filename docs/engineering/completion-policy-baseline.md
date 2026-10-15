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

## P10-a semantic command seam (partial)

`createCompletionCommands` injects the already owned I01 gateway, a Task reader and the existing FamilyDB completion methods. It does not import/open storage or introduce another points/recurrence writer. `requestCompletion`, `approveCompletion` and `rejectCompletion` require the current SQL actor and root-Task edit authority before cache replay and inside new writes. Approval/rejection require an adult; new writes check the canonical Task revision, rejection requires a nonblank reason, and exhaustion refuses422.

The existing policy determines the actual result: lifecycle/approval plus `actualColumn` are returned, so a child needing approval getsReview rather than guessedDone. Exact UUID retries do not repeat rewards or recurrence; a fresh approval for an already accepted Task is harmless. Callback faults roll back canonical state, points, notification records, successor and cache. Mixed recovery retains the committed UUID and never replays points.

Runtime injects FamilyDB only after storage opens. New session-authenticated app routes are `POST /api/productivity/tasks/:id/complete` (`expectedRevision,proof?`), `/approve` (`expectedRevision`) and `/reject` (`expectedRevision,reason`). Strict payloads reject caller actor/clock/reward/assignee fields; proof and media validation still go through the existing writer. Scoped Task/reward invalidation is emitted after commit; successor events use current audiences and never include private identity/body in global payloads. These are existing internal app sessions, with no integration token or external API.

A fresh independent whole-branch review found0Critical/1Important/0Minor. All findings were graded before one correction, with no rereview. It exposed a real response privacy issue: below-threshold child completion could disclose the ID of a private successor rotated to another recipient. The correction reprojects successor references through fresh ACL on **every return, including cache replay**. The full internal list remains only in a result-bound WeakMap for trusted scoped SSE dispatch, with no serializable hidden-ID property. Three direct/cache-revocation/actualHTTP regressions failed before the correction and then passed. A restarted factory also applies current successor ACL. HTTP SSE assertions verify one Task invalidation for the child and both root/successor invalidations for the authorized member.

Initial characterization fixture import collected0tests and is retained as invalid verification. An initial HTTP dependent case accessed an absent response task while routes were unimplemented; it was corrected to assert the200 precondition, then all6 genuine missing-route REDs were observed. A private SSE fixture initially allowed recurrence rotation to assign a legitimate successor toChild; the isolated private-event test uses a nonrecurring Task and retains all negative privacy assertions, while a separate private-rotation test now covers that transition explicitly. No assertions were removed or deadlines increased.

Current focused verification:34tests/4files passed after correction;358related/evidence cases passed before the final privacy regressions; corrected fullCloud3924/3924tests217files/3924matchingJUnit passed with0failed/skipped/todo, lint/build0 and coldimportDB0. Exact Windows verification and acceptedPR98base composition are pending. All fixtures are synthetic/offline; notification records are not live provider delivery. No settings default, reward schema, underlying completion policy or release/deployment was changed.

**Full P10 is unfinished.** Linked reopen reversal/cutover review, richer recurrence/virtual preview/series exceptions/claims/jobs, dispatch of every retained generic completion surface through semantic ports and board workflow integration still follow in focused slices. P08/P09 workflow Done must consume the shared policy and must not be marked complete by this partial seam. Default pilot activation and R02/Server2019/release/VPS remain unclaimed.
