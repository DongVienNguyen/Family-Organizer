# Browser fixture routing boundary (F09 follow-up)

The main108 WebKit B01 failure retained the uncaught-page-error assertion. Its
trace shows reload, a test-client Route.continue and then a same-origin catalog
fetch pageError; later catalog409 responses are normal for the inactive domain.
This establishes a routing/navigation overlap, not an application CORS/auth bug
or proof of the sole WebKit engine cause. Sanitized evidence is retained separately.

Legacy, Productivity and native-touch fixtures now share one offline boundary.
The owned server must be an explicit HTTP(S)127.0.0.1 origin with a nonprivileged
port and no credentials, path, query or fragment. A serializable negative-origin
RegExp filters owned requests before dispatch to the Playwright test client.
HTTPS Google font requests receive synthetic CSS locally; every other foreign
origin is aborted and recorded without query credentials. Productivity and touch
also gain explicit unexpected-destination assertions.

A function matcher is insufficient: pinned Playwright1.64 serializes it as a
catch-all glob. The server can apply a RegExp before emitting a route event to
the client. WebKit still enables native request interception globally and uses
server fallback for unmatched requests; this change removes the avoidable client
round trip, not all native interception. No browser error is filtered or ignored.

Independent TypeScript syntax comparison retains every original expect expression:
348legacy,199Productivity and24touch, plus two new external-network assertions.
All45legacy+57Productivity+1native-touch cases, deadlines and zero retries stay
unchanged. Thirteen unit regressions cover owned traffic, foreign loopback ports,
font fulfillment, private query diagnostics and invalid owned origins; the suite
and omission regression are mandatory in Windows quality evidence.

One review finding changed the initial function matcher to a serializable RegExp.
The new serialization guard produced13tests/12passed/1failed; the corrected
303-case target then passed. No rereview or assertion weakening was used.

The pre-correction CloudLinux browser diagnostic passed15Chromium cases but lacked
Firefox/WebKit binaries, causing two launch failures and28automatically unrun cases.
It is not a full-suite pass or proof of the corrected RegExp. Its reports remain
preserved. Full corrected Windows103-case first-attempt proof is required before
acceptance; Windows2022 remains separate from Server2019/R02. No application
runtime, feature, dependency, production secret, release/tag or VPS change is part
of this fixture correction.
