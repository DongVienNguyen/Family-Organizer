# Roboto used by the bundled PDF engine

pdfmake0.3.11 includes four Roboto3.014 (2025) font files in its virtual
filesystem. Their name tables identify the original copyright as
`Copyright 2011 The Roboto Project Authors (https://github.com/googlefonts/roboto-classic)`
and the license as SIL Open Font License1.1. The accompanying OFL text is
retained verbatim from
https://raw.githubusercontent.com/googlefonts/roboto-classic/main/OFL.txt
(retrieved2026-10-18, SHA256
`061402327a96aadb0bfb694a960ed289ecd38d383e396243831ab81feb109c41`).

`wallet-pdf-license.mjs` pins the actual four decoded font files and verifies
the server and browser bundles against those bytes. pdfmake's MIT notice and
original package/author metadata remain in the existing build-input inventory.
No new copyright owner or replacement license is asserted.
