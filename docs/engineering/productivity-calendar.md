# Calendar and Timeline — P11 functional core

**P11 Calendar/Timeline core (2026-10-18):** source `c84376879fea854f5d3b03d16fb34ab6fd6aa4a0` adds four
views, current-ACL task/FamilyPlan/virtual projection, reviewed independent
timeboxes and one-cycle moves through I01/P10, explicit DST choices, navigation-
safe unknown requests, readable phone month details and fresh authorized ICS
window download. No schema/automatic activation/package-cap change.
Cloud full8459tests507files/matching JUnit, zero failed-skipped-todo;
all8409 parent cases +50 retained (2W17system+48P11), lint/build0.
Whole Calendar Chromium4/4/native0/firstattempt/offline/owned13Taskfixture/
normal-stop/integrity/closed/cleaned/source-build-bound. Actual modal navigation
and narrow mobile-title failures corrected; original failed reports/trace kept.
[Details](productivity-calendar.md), [proof](evidence/p11-calendar-development.json).
Author inspection only; PR/CI URLs:none for this source; backup branch.
P11ICSimport→P13; future/allseries edits reuse the existing task editor.
Next P12collaboration/reminders and remainingP/W18/M1/I02/I03, then final composed
Windows including allparents+Calendar harness. ActualServer2019R02 unrun;
no release/tag/VPS. Separate PR136 historical greenCI is not this source's CI.

The Calendar button beside List/Matrix/Kanban opens Month, Week, Agenda or
Timeline. Month uses readable selected-day details on phones. Existing task
filters select the same canonical task IDs; FamilyPlans keep their existing
source and visibility policy. FamilyPlan wall times retain the documented
Asia/Saigon assumption. All-day dates remain their original calendar date across
viewing timezones; scheduled intervals do not replace the stored deadline.

Dragging or using Reschedule opens an editable draft and read-only server preview.
Deadline edits need an additional explicit confirmation. A future occurrence
creates one durable exception through P10; editing the whole series remains in
the existing task drawer. No action completes or rewards a task or posts money.
Invalid/gap wall times are rejected; repeated DST wall times require a choice.

Unknown write results keep the exact reviewed body and key in the authenticated
TaskProvider. Check later hides the modal without discarding the request; opening
Calendar again restores it. Logout or fresh authoritative revocation clears it.
No device financial cache/offline write queue is enabled. PLANS_UPDATE invalidates
the projection before another read, including revoked plan bodies.

Download visible calendar performs a fresh authorized internal query first and
exports the selected window to a local ICS file. It does not create a public
feed or encode credentials/recipients. Virtual entries are tentative snapshots,
not an RRULE promise. Unresolved timestamps must be reviewed before export.
ICSimport and lossless task-content roundtrip remain P13.

The current browser harness is portable and synthetic. It has not yet joined the
mandatory final Windows batch; I03 must wire it alongside all existing suites.
Cloud and Windows2022 checks do not qualify WindowsServer2019; R02 remains unrun.
