# P04 shared task drawer

The authenticated task workspace reads the canonical internal API through one
session-owned memory cache. List and the retained board open the same task ID and
editor. Closing a dirty drawer offers to keep its draft; explicit reload discards
it. Logout/account changes clear records, drafts and pending command identities.
Private draft text is never saved to browser storage. A revision conflict keeps
the draft and requires an explicit reload; writes require an online session.

The drawer supports title, description, no/high/medium/low priority, no deadline,
all-day or timed deadlines, assignee, named tags, blocked reason, list, section,
parent, checklist, subtasks and personal pin. Checklist/section changes do not
complete tasks. Atomic subtask creation derives its list/section from the freshly
authorized parent and defaults to zero reward, no deadline and no priority.
Retained comments, history, proof and approval/completion buttons use the existing
business bridge. The advanced form retains recurrence, rotation and reward
settings. P10 owns the new completion workflow; P11 owns calendar scheduling UI.

Personal pins use explicit productivity migration4. Their revision belongs to
that actor's preference, independently of task revision and rewards. Other actors
cannot read the preference or receive its metadata event. Guest sessions cannot
write pins. Fresh task access is checked before cached command replies.

Migrations1–3 retain their exact SQL/checksums. Compatibility inspection and normal
startup leave existing versions1–3 unchanged. Explicit pilot migration adds4;
unsupported future versions and changed checksums are refused before bootstrap
writes. Ordinary snapshots and encrypted recovery carry pin rows and validate
user/task references. Controlled activation remains P18-owned; this change adds
no activation endpoint or production migration command.

Windows CI requires the separate `Windows productivity browsers` check, all four
named P04 flows on Chromium, Firefox and WebKit, one attempt and no skipped tests.
The original `Windows production browsers` check still requires all45 existing
cases. Both jobs preserve JSON, JUnit, HTML, traces, runtime/build hashes, native
exit evidence and fixture/shutdown checks. Cloud Chromium results are development
evidence only; Server2019 acceptance remains R02 and has not run.
