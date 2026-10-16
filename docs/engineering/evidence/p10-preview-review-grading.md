# Frozen P10-d2 review: complete root grading before one correction pass

BASE dd1407a85f81105af7de03107afde3a8d333fcd3; reviewed HEAD 2f0ab90a04f0490f8c8d88e287d1f319e7f13877.

- I1 Important accepted: include returns before consulting explicit overrides for awaiting acceptance, and the exceptions loop discards later completion ordinals. Preserve explicit due metadata without inferring completion, while retaining skip/no-date, count, end-date and range bounds. Unknown calculated successors stay absent.
- I2 Important accepted: each candidate calls whole-policy normalization; explicit-date normalization validates every date with localDayStart. Prepare a detached validated planner once per projection, retaining full validation for standalone public planner inputs. Add maximum-valid-366-date functional and shared-validation regression, without timeouts or relaxed bounds.
- M1 Minor accepted and deferred to later P10 owner: extreme nominal fast-path horizon rejects bounded moved exceptions. Do not broaden this correction pass or silently claim fixed.

All declined boundaries accepted: exact-HEAD Windows/raw/native/browser qualification remains root-owned; Server2019 R02, P10 materialization/history/scheduler/commands/UI/legacy cutover and reward reversal, broader Windows p95, production rollout and earlier closed reviews remain outside this preview slice. No release/VPS permission implied.

ONE TDD correction pass covers I1 and I2 after this grading; no rereview. Existing assertions retained. New skills' subordinate templates unavailable as recorded; actual fresh reviewer/report used.
