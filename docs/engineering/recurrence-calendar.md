# Calendar recurrence arithmetic (P10-c1)

`server/productivity/recurrenceCalendar.ts` plans one all-day calendar slot without
reading storage or creating Tasks, rewards, jobs or notifications. It is not
wired into runtime completion and does not establish accepted-completion authority.

`planRecurrenceCalendar` requires a due/completion base, original anchor date,
named timezone, daily/weekly/monthly/yearly frequency, interval, positive ordinal
and explicit `clamp` or `skip` policy. Ordinal1 is the first slot after the base.
Every ordinal is computed from the original anchor. January31 therefore produces
February28/29 and March31 instead of drifting to March28/29. A skipped invalid
month returns its year/month/requested day explicitly; it is not completion.

Due-base planning retains the anchor cadence even when acceptance occurs late.
Completion-base planning derives its base calendar date from the supplied
accepted-completion UTC instant in the series timezone. Calendar day/week steps
follow dates across DST rather than assuming local days always last24hours.
This helper does not resolve local timed wall clocks or choose between DST folds.

Input fields, dates, UTC instants and timezones are validated. Interval is1–366,
ordinal1–100000, supported resulting years1000–9999. Nonexistent local dates
are refused. `normalizeRecurrenceDates` validates1–366 explicit date entries,
returns a sorted unique copy and preserves the caller's array. The bound applies
before deduplication. No ambient clock or host timezone participates.

Tests cover due/completion bases, leap years, immutable anchors, explicit skips,
DST dates, explicit-date normalization, input/resource/range limits and an isolated
offline cold import. Both suites are mandatory in Windows quality evidence.

Durable series/occurrences, end/count/missed policy, range previews, timed
recurrence, edit/skip/rotation commands, scheduler recovery and final completion
writer cutover remain P10 work. This arithmetic slice does not complete P10 or
activate any new policy. Windows2022 proof remains separate from Server2019/R02;
release/tag/VPS actions are not authorized.
