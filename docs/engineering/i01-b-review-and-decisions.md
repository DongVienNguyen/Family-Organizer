# I01-b review and decisions

One fresh whole-branch review of `ab83299..f9bbdc0` found four Important defects;
no Critical or Minor findings. Grading retained Important because each affects
storage compatibility, automatic delivery safety or maintenance ownership.

- A new30-minute effect key allowed an unknown daily backup/weekly digest to be
  sent again. Use one local-day/week occurrence key within the same registry;
  uncertainty blocks later ticks/restarts. Cost: local timezone is part of the
  legacy schedule contract; there is no automatic unknown-outcome reconciliation.
- Awaited temporary cleanup could overwrite an unknown send error. Retain the
  primary outcome and classify post-acknowledgement failure as non-replayable.
  Cost: a locked leftover file requires operator cleanup; the log is redacted.
- A cached bootstrap command skipped the schema version callback. Check the
  persisted version on every launch, outside the cached initializer. Cost:
  unsupported restored/upgraded storage fails closed before readiness.
- web-push timeout is socket inactivity, not total time, and ignored worker
  cancellation after sending. Keep library encryption/VAPID generation, own
  HTTPS requests with absolute15s deadline, abort and request-close settlement,
  plus64KiB response cap. Cost: maintain transport classification/ownership;
  no promise race leaving background network work.

One RED→GREEN fix pass, no re-review. Seven newly failing cases: two semantic
occurrence/restart cases, cleanup certainty, repeated-bootstrap compatibility,
and three offline loopback transport cases. All prior provider assertions remain;
request-generation/provider-outcome fixtures now explicitly inject the transport.
One additional successful-response test checks acknowledgement/closure.
Full Cloud Node24 suite265/265 in34files; no skips or lowered assertions.
No provider/AI calls or production data were used. No dependency/lock changes.

Reviewer declined exact-HEAD Windows/authenticity, real delivery/performance,
Server2019/package/service, F04 audit and I01-c snapshot/recovery acceptance.
First Windows GREEN was independently checked, but corrected/final HEAD needs
its own CI evidence. I01-c and remaining task gates stay explicitly incomplete.
