# F09 — isolated Caddy native baseline
Caddy2.11.7 Windows AMD64 was downloaded from its official release and matched
GitHub SHA256, official SHA512, executable PE/hash and Apache2 license bytes.
That Cloud download inspection does not execute the binary or prove Server2019.

The Windows quality job uses an isolated private temporary directory and synthetic
loopback backend, HTTPS and admin ports. Only localhost receives a private internal
CA certificate. Config explicitly disables trust installation; the admin endpoint
exists solely to stop the owned synthetic Caddy process. It is not production config.
No public domain, ACME, production service, provider or family data is involved.

The draft probe checks native version/validation, TLS with the fixture CA,503 then200
backend states, forwarding of the synthetic auth header and replacement of spoofed
proxy headers. Default trust must refuse the fixture CA; local admin stop must yield
native0/null signal. Exact archive/executable/license hashes, native exits and owned
cleanup are mandatory evidence. Existing/replaced directories must be preserved.
Private certificate keys and downloaded binary stay outside uploaded reports.

Pure policy/ownership/evidence/gate tests passed206/3. Frozen pinned Cloud
2127 tests/110files, zero failed/pending/todo, lint/build0 passed. Native Windows
and one wholebranch review are still required. The false trust flag
currently follows explicit pinned config and Node CA refusal; independent Windows
certificate-store proof has not run. This limitation is included in review scope.

This slice does not install a Caddy service, configure production DNS/TLS, or prove
compiled Express behind the proxy on Server2019. Those remain separate acceptance
and operator gates. No release/tag or VPS access/deployment is authorized.
