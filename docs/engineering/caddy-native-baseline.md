# F09 — isolated Caddy native baseline
Caddy2.11.7 Windows AMD64 was downloaded from its official release and matched
GitHub SHA256, official SHA512, executable PE/hash and Apache2 license bytes.
That Cloud download inspection does not execute the binary or prove Server2019.

The Windows quality job uses an isolated private temporary directory and synthetic
loopback backend, HTTPS and admin ports. Only localhost receives a private internal
CA certificate. Config explicitly disables trust installation and admin configuration persistence.
Caddy profile, AppData, XDG config/data and temporary paths all lie inside the
owned fixture; inherited user profile paths are excluded. the admin endpoint
exists solely to stop the owned synthetic Caddy process. It is not production config.
No public domain, ACME, production service, provider or family data is involved.

The draft probe checks native version/validation, TLS with the fixture CA,503 then200
backend states, forwarding of the synthetic auth header and replacement of spoofed
proxy headers. Default Node trust must refuse the fixture CA with a certificate verification
error; transport timeouts/resets do not count. A read-only Windows PowerShell
probe checks the exact synthetic root fingerprint against CurrentUser and
LocalMachine Root stores. Both must contain zero matches. Local admin stop must yield
native0/null signal. Exact archive/executable/license hashes, native exits and owned
cleanup are mandatory evidence. Existing/replaced directories must be preserved. One Node owner supervises the
PowerShell worker and checks exact native parent/leaf identities before outer
cleanup. A failed worker preserves the entire tree, including an inner replacement
whose cleanup the probe refused.
Private certificate keys and downloaded binary stay outside uploaded reports.

Historical pure policy/ownership/evidence/gate tests passed206/3; the corrected
three suites contain229 assertions in the frozen full run. Pinned Cloud
2150 tests/110files, zero failed/pending/todo, lint/build0 passed. Native Windows
is still required. The single complete review found three Important defects
(profile escape, outer cleanup and trust proof); all were accepted before one
author correction pass. Native Windows certificate-store observations have not
yet run; source-policy observations are not native proof.

This slice does not install a Caddy service, configure production DNS/TLS, or prove
compiled Express behind the proxy on Server2019. Those remain separate acceptance
and operator gates. No release/tag or VPS access/deployment is authorized.
