# P10 editor acceptance validation repairs

These are root causes exposed by the preserved post-review acceptance assertions, not a repeated whole-branch review. The initial local review0C3I2M and one review correction remain closed. All three validation items below were identified and graded before their combined source repair.

| Item | Grade | Actual evidence | Repair |
| --- | --- | --- | --- |
| V1 | Important | C28 waits for the existing app confirm dialog named Bỏ qua; the dialog renders a heading but has no accessible name. | Shared ConfirmDialog gets a unique heading ID and aria-labelledby. Preserve the original named-dialog assertion and existing confirmation flow. |
| V2 | Important | C27 DOM/event attachments show Enter on Tần suất at40px height, opening adds border and changes height to42px, an outer drawer scroll occurs, aria-expanded becomesfalse, then Escape reaches the parent and closes it. Position/width stay equal. | Use a layout-neutral outline for open highlighting (the existing unlayered neu shadow overrides Tailwind ring shadows); do not change external-scroll close semantics, add delays, change selectors again or weaken Escape assertion. Assert stable geometry and genuinely expanded state before Escape. |
| V3 (I1 boundary) | Important | C29 separately reproduces a one-count completion-based series requiring a nonexistent next deadline; expected0alerts, actual1 before confirmation. Parent backend already supports ending that series without a fabricated date. | Match the backend count/ended/cursor bounds when deciding whether an initial next deadline is required; keep next-deadline inputs separate and initially empty. |

Before this batch: corrected full Cloud5338/292/JUnit passes; full Chromium has28passes/2failures(C27/C28), and targeted validation has1pass/3failures(C27/C28/C29). Raw reports/traces/event attachments retained. C29/C30 prior privacy/explicit-choice regressions and cache expansion had already gone RED→GREEN. No assertion removal, retries, skips, deadline increase or continue-on-error. Full acceptance remains pending after these source repairs and exact Windows qualification; Cloud GitHub credential currently401.
