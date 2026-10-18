# Durable recurrence command pilot

P10-d4 backend extends the explicit schema11 ownership pilot with additive12 skip decisions. Default storage registration stays6 and existing installations1–11 do not automatically upgrade. Operators must not activate the unfinished recurrence editor/cutover from this implementation alone. Existing opaque `productivity_occurrences` data and frozen migration/table registrations remain intact.

Skip uses the existing authenticated application session and adult/object edit permission. It requires both the current Task revision and current series revision. A pending submission must first be resolved. The original Task becomes stopped (`wont_do`) with proof/history preserved. One append-only skip decision resolves its frozen physical open occurrence, and at most one clean successor uses the same assignee. Skip never creates an accepted claim, reward, rotation advancement or reversal. A repeated UUID, fresh duplicate or process restart cannot create a second decision/successor. A stopped Task cannot bypass this owner through generic status updates or reopen.

A completion-based initial skip without an actual accepted completion requires an explicit next deadline. A subsequent skip uses the latest actual acceptance and the relative ordinal offset. Source skip time is never invented as an accepted completion. Deadline reminders queued before a Task stops are suppressed at delivery resolution; historical inbox entries and other task notices are retained. No test delivers notifications.

`editSeries` accepts `this`, `future` and `all` with a series revision. `this` targets an unfinished current slot or one virtual future ordinal. A materialized deadline requires its Task revision; a future exception writes no Task. `future` changes policy/explicit anchor while honoring the current Task. `all` can additionally change the explicit current deadline, with its Task revision. Completed/skipped occurrence facts and reward history are immutable. The anchor changes only when explicitly supplied; timezone changes are refused. Count cannot exclude the current ordinal; only out-of-range unmaterialized exceptions are pruned. Roster configuration changes reanchor its configuration cursor to the current assignee; accepted count and rotation events do not advance.

On explicit12, missed-cycle behavior is selected when an authorized acceptance/skip resolves the current occurrence. The current overdue Task remains visible until that event:

| Policy | Next selection |
| --- | --- |
| `catch_up` | First unresolved eligible slot, at most one per explicit resolution |
| `latest` | Most recent missed eligible slot, or first current/future slot if none was missed |
| `skip` | First eligible slot whose all-day date has not passed or whose timed instant has not passed |

Omitted cycles are not completed or rewarded. Count/end/date-list exhaustion ends the series. An adult's explicit deadline exception takes precedence over automatic missed selection. DST ambiguity still requires an explicit instant. Frozen11 retains its previously accepted materialization behavior until an explicit12 pilot upgrade. Selection runs synchronously within the shared transaction; no background completion/reward job exists, and a restart alone cannot generate a successor.

New internal routes beneath `/api/productivity/tasks`: `POST /series/:id/edit` with `{expectedRevision,scope,patch}` and `POST /occurrences/:taskId/skip` with `{expectedRevision,input:{expectedSeriesRevision,nextDue?}}`. The occurrence ID is the materialized canonical Task ID. These are internal session-auth routes; no external API credentials/provider surface is added. Fresh authority is checked before UUID-cache lookup and in the transaction; events contain canonical IDs after commit and use the existing audience resolver.

Local whole-branch review, regressions, exact source hashes and full test counts are recorded in `evidence/p10-series-development.json`. A fresh independent reviewer is not claimed in this session. Windows acceptance is separate and must bind the actual PR HEAD/run/raw reports. This backend work does not finish fullP08/P09/P10, the editor, controlled legacy recurrence migration, other Productivity/Wallet tasks, or Windows Server2019 acceptance. No release/tag/VPS operation is authorized or performed.
