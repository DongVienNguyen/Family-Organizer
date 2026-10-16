# Synthetic Windows proxy ports (F05 follow-up)

The previous UDP-first ephemeral reservation prevented selecting a TCP-only port
that QUIC could not bind, but it did not establish that the UDP-selected port was
permitted for TCP. The main107 push run38832237610 observed EACCES both before
Caddy startup and in the real dual-reservation regression. Its actual excluded
ranges and exact failed allocation stage were not captured; a specific historic
Windows exclusion range is not claimed.

The Windows-only fixture allocator now reads IPv4 TCP and UDP excluded ranges and
current numeric endpoint ports using three bounded read-only native commands.
Every exit status, signal, execution error and output bound is checked. Supported
English Windows2022 output is parsed strictly; unknown output fails closed with
bounded phase diagnostics. Endpoint addresses/native exception text are not
copied into reports. No network policy, service or system trust is modified.

The allocator chooses one random candidate from the intersection of both protocol
permissions excluding occupied ports. It binds UDP once and TCP once, holds both
through configuration validation and releases them immediately before Caddy
startup. A later race still fails closed. There is no test, native assertion,
bind-allocation or CI retry, protocol disablement or deadline extension.
Existing actual collision/refusal, partial-release and idempotent cleanup
assertions remain intact. Non-Windows Cloud diagnostics retain OS ephemeral
allocation; they do not establish Windows behavior.

The native Caddy report records the selected port, normalized policy arrays and
all three native exit codes. The F05 acceptance proof must independently verify
that this candidate is outside both exclusion sets and the occupied endpoint set,
and retain all six TLS/header/private-CA/refusal/graceful-stop phases. This is CI
fixture infrastructure, not an application listener or Server2019 acceptance.

A separate main108 WebKit B01 navigation failure is under investigation. Its trace
shows a Playwright internal route continuation overlapping page.reload before a
same-origin fetch pageError. It is not classified as an application CORS/auth
bug, and no browser-error assertion is suppressed by this port fix.
