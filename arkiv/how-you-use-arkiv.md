# How GuardLink uses Arkiv

The Worker publishes only allowlisted public milestones from the claims workflow and receipt-checked Arc changes. The writer creates wallet-owned records on Rabdi. `Follow the fund` reads those records, and `Follow public milestones` on a private case page runs a case-scoped query. A community agreement describes contribution, coverage and duration as recorded at execution; an executed proposal includes its on-chain vote totals.

Read a public case projection without a wallet:

```text
GET https://guardlink.ajnasnb.com/api/v1/transparency/?caseId=dfd3e4f9-9008-4e60-b420-f10ae15c5f81
```

The adapter selects `project = guardlink AND caseId = <reference>`, restricts the owner to the disclosed writer, and returns the safe result. The case selector separates timelines, the owner filter excludes foreign records, and the expiry bounds public test data retention to 30 days. Receipt-linked paid and governance milestones give people a direct path to Arc. [Schema](schema.md) · [Adapter](../worker/src/adapters/arkiv.ts)

The original verification found 24 published records, including 14 scoped to the example case, a community terms record with a 6 test USDC limit, and a governance execution with nine yes votes. `node scripts/verify-public-records.mjs` rechecks the saved case without publishing. `node scripts/verify-arkiv.mjs` is an operator tool that signs in, publishes pending entries and checks the result. [Original verification](../docs/ethglobal/arkiv-verification.json)
