# Explicit first account

F04-j replaces automatic `admin/admin123` creation with a local compiled operator.
Existing SQLite and selected legacy JSON retain their identities, password hashes,
settings, records and normal runtime startup. Deleting users/database is not a
password-reset procedure. Tests alone use an explicit synthetic legacy fixture
containing the old password; production has no test-mode seed path.

Build emits `dist/operator.cjs`; package script `installation:initialize` runs it.
Its launch contract requires `NODE_ENV=production` and the same absolute external
DATA_DIR/CONFIG_DIR/LOG_DIR as the runtime. Send a JSON object with exactly
username, fullName and password through owned stdin, then close stdin. Do not put
passwords in argv, environment variables, files, logs or shell history. Only the
operator with installation storage access should run it. F06 supplies a masked
PowerShell wrapper using bundled Node, native exit checks, ValidateOnly/WhatIf;
that wrapper and Windows account ACLs/service orchestration are not proven here.

Input is limited to16KiB and20seconds. Username is normalized lowercase ASCII
(1–100 characters, letters/digits/dot/underscore/hyphen); full name is nonblank
and at most256characters. The first password requires at least16characters after trimming edge whitespace and at most4096UTF-8 bytes. Operator output is one public JSON result or
constant error code with exit1, never the input, raw parser/storage error or stack.
A caller-specified role is refused; the first identity is Admin. Password uses a
fresh16byte salt with the existing120000-iteration PBKDF2/SHA512 verifier.

The command refuses any selected db.json before opening storage. It requires a
pristine known SQLite schema with empty business/commands/metrics and only the
schema-version metadata. Unknown tables, other metadata, data or prior creation
are refused. The existing IMMEDIATE gateway rechecks the guard and commits all
original collection defaults and one chosen account together. Its command cache
contains the public result and hash metadata, never the plaintext password. Native
ownership closes on success and refusal. This command does not repair, migrate,
reset passwords or clear existing data. A new runtime with neither SQLite nor
legacy JSON refuses before creating SQLite. A userless partial installation with
business data refuses rather than reimporting stale legacy JSON.

Login rejects non-object/non-string/empty/oversize credentials before lookup and
crypto. Unknown live roles, deleted users and malformed hash shapes cannot issue
or validate sessions. Existing four roles, case-insensitive login, salted hashes
(including historical arbitrary salt), legacy1000-iteration hashes and opaque
session/logout/key-version behavior remain. Malformed stored digests fail closed;
legacy passwords above4096bytes require an explicit operator reset in F07. No
provider delivery, public integration/auth API or new token model is added.

Evidence includes actual owned native processes, duplicate/legacy/partial refusal,
valid login/restart, unchanged logical rows, plaintext scan and offline fixtures.
Windows Node22/24 CI additionally runs the compiled operator from System32 against
its production dependency tree, checks duplicate/invalid refusal, all-table
preservation and closed SQLite files. Required-suite/proof gates reject missing
reports. These probes do not prove a standalone bundled ZIP, Windows service,
PowerShell wrapper or Windows Server2019 acceptance; those are F06/F07/R02.
