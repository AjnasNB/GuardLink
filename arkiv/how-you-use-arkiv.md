# How GuardLink uses Arkiv

The Worker publishes only allowlisted public milestones from the claims workflow and receipt-checked Arc changes. The writer creates wallet-owned records on Rabdi. `Follow the fund` reads those records, and `Follow public milestones` on a private case page runs a case-scoped query. A community agreement describes contribution, coverage and duration as recorded at execution; an executed proposal includes its on-chain vote totals.

Read a public case projection without a wallet:

```text
GET https://guardlink.ajnasnb.com/api/v1/transparency/?caseId=dfd3e4f9-9008-4e60-b420-f10ae15c5f81
```

The adapter selects `project = guardlink AND caseId = <reference>`, restricts the owner to the disclosed writer, and returns the safe result. Check `docs/ethglobal/arkiv-verification.json` for live values and entity keys. The publisher is batch-limited and receipt-backed updates are idempotent. `node scripts/verify-arkiv.mjs` uses the local test actor to publish pending entries and verify the live reads.
