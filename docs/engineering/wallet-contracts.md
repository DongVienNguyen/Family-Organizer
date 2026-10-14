# Wallet W01 contracts

This slice provides pure money/date/filter contracts. It does not activate Wallet,
add storage or routes, or change retained finance behavior. W02–W18 and the
Matrix/Kanban work remain separate acceptance tasks.

Money uses canonical signed64 integer strings and bigint arithmetic. VND has
exponent0 and USD exponent2; unsupported currencies refuse until an explicit
currency policy is added. Form parsing is unsigned, rejects excessive precision,
and accepts the selected en-US, vi-VN or zh-CN grouping/decimal grammar. Posting
money may be signed. Formatting never converts an amount to Number. Rational FX
is target major units per source major unit, both ratio components positive;
currency exponents are applied before one half-up rounding (ties away from zero).
The result must remain within signed64 range. Rate lookup/history belongs to later
Wallet tasks; missing valuations are never fabricated as zero.

Effective dates use explicit ISO calendar dates and named timezones. Import date
strings require explicit YYYY-MM-DD, DD/MM/YYYY or MM/DD/YYYY format. Periods are
half-open local date ranges; weeks start Monday. Shared validated Gregorian/ICU
helpers provide leap-year and timezone behavior independently of host timezone.

Filters default to any label and include transfers. Arrays use OR within a
facet, facets use AND, empty explicit arrays select no records, and category
selection includes descendants. Amount bounds use absolute reference-currency
minor units; a cross-currency record requires an explicit reference valuation.
The pure predicate assumes already-authorized record and category projections.
It cannot replace W04 account/record ACL or later permission-aware joins.

Tests use synthetic values only. These contracts do not prove Windows Server2019
acceptance, which remains R02, or authorize release/VPS access.
