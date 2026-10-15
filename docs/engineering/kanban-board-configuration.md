# P08-b4: shared board configuration

Development verification is running; exact-HEAD Windows acceptance is pending.
This slice adds manager-authorized configuration and an internal session route,
not the full board projection/move API or UI. Full P08 remains incomplete.

`POST /api/productivity/boards/configure` consumes the existing session, request
UUID and `{expectedRevision,input:{listId,mode,policies}}`. Inputs cannot supply an
actor, clock, private-view/filter scope, column identity or override. Canonical
`(list_id,mode)` is unique; sections are built from live list sections plus Not
Sectioned, and workflow has seven derived lanes. Views cannot create independent
capacity scopes for the same list/mode.

Fresh user/role, active parent list and administrator/member-manage rights are
checked before the I01 result cache and again inside its synchronous transaction.
Children/guests refuse; a foreign or archived scope is masked. A revoked manager or
archived parent cannot replay a prior success. Schema6 returns409 without board
DDL; only explicitly prepared7 accepts configuration. No startup migration/default
cutover occurs.

Configuration seeds missing scoped positions for actual canonical Task identities,
preserves existing positions/ranks and does not change Task fields, lifecycle,
approval or rewards. Applying a hard limit below the current count retains all
Tasks; the accepted all-writer invariant refuses new entrants. Switching to off
stores a null limit. Existing policy settings survive unrelated column additions.
Unknown/duplicate columns and malformed policies refuse before writes. Bounds are
1000 policies/active columns and100000 missing Task rows; these are resource limits,
not performance benchmark results.

Board/column/position changes, revisions and idempotent command metadata share the
existing I01 transaction. The response contains configuration metadata only, with
no Task IDs/titles/counts. The existing catalog SSE signal carries no object data
and targets the list metadata audience after success. There is no provider,
notification, public integration/auth-token surface or new completion writer.

Tests exercise actual I01/native storage plus real authenticated local HTTP:
canonical seeding/no Task changes, shared scope uniqueness, hard/soft/off policy,
manager revocation, archived-list replay refusal, malformed/forged caller data,
revision conflicts, unchanged UUID retry and rollback after seeding. Original
notimplemented/domain/HTTP, off-null constraint, mandatory evidence and archived
parent review failures remain distinct. Assertions and validators are retained.

ONE whole-branch SELF-review0Critical/1Important/0Minor was graded before one
correction, with no rereview. The archived-list regression18/17/1 led to checking
active catalog metadata before cache lookup and inside the transaction; an HTTP
regression covers the same boundary. Final checks/results remain in the status and
evidence documents once complete.

Board read projections/private counts, saved-view board references, preview/apply,
manual/group moves, explicit fresh-admin override with audit, section archive
preview and eventual P09/P10 UI/completion remain subsequent work. No full P08,
Server2019, release/tag or VPS acceptance is implied.
