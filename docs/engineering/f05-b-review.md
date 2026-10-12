# F05-b whole-branch review

Single fresh read-only review of BASEb0f9a01..5722cc5, including initial Windows
measurement and coverage gates. No Critical; two Important and one Minor. All
were accepted before one TDD correction pass; no repeated review.

1. Important: pinned setup-node v5 auto-caches when packageManager selects npm,
   even without cache:npm. Both steps explicitly disable package-manager-cache;
   only the explicit OS/arch/exactNode/npm/lock npm-tarball cache remains.
2. Important: the installed provider also supports node:coverage and JSDoc-style
   ignore hints. Two actual RED cases prove the missing refusal; the source scanner
   now rejects both alongside v8/c8/istanbul, without removing any source files.
3. Minor: LCOV hit multisets did not bind function declaration/name and individual
   branch identity. Five actual RED cases prove contradictory details accepted.
   Compare actual Istanbul reporter function line/name/hit and branch line/map-key/
   index/hit tuples. Existing counter/source/floor checks remain required.

Seven observed RED cases and46 prior positives in two files. Corrected target158/158 threefiles, full Cloud1222/1222 in80files, lint/build0
and actual104-file JSON/LCOV cross-check passed. Corrected exact Windows HEAD evidence pending; in-process coverage does not claim full
legacy app coverage or Server2019 acceptance. Main enforcement remains403.
