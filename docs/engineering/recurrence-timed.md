# Timed recurrence arithmetic (P10-c2)

`planTimedRecurrence` is a pure helper for one timed calendar slot. It builds on
P10-c1's bounded immutable-anchor calendar arithmetic and the existing shared
local-time resolver in `src/features/productivity/dates.ts`. It has no storage,
Task/reward writer, scheduler or runtime completion wiring.

A due-based series keeps the original local wall time and calendar cadence.
Completion-based arithmetic derives both date and wall time from the supplied
accepted UTC instant in the explicit named timezone. It does not decide whether
that completion is authorized. Ordinals always refer to the immutable base;
monthly clamps do not shift later slots away from the original day.

A unique resolvable local timestamp yields an explicit UTC instant, preserving
seconds and milliseconds. Spring gaps, autumn folds or an instant outside the
shared resolver's supported range return `time-resolution-required` with the
local date/time and `explicit-instant-required`. The caller must resolve that
condition explicitly; no guessed deadline or occurrence is created. Calendar
month skips retain P10-c1's explicit skipped-slot result. A wholly nonexistent
local date remains a refused calendar input.

Tests cover both DST directions, gap/fold refusal, half-hour DST, quarter-hour
timezones, midnight, milliseconds, due versus completion bases, immutable monthly
anchors, explicit skips, strict bounds and offline cold imports. The timed suite
is mandatory in Windows quality evidence. Existing bundled board/package/service
proof is retained; this slice does not add a native recurrence probe or activate
recurrence. Durable series/occurrences, range preview, end/count/missed policy,
edit/skip/rotation commands and completion writer cutover remain P10 work.
