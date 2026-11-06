# ETHGlobal Continuity baseline

Recorded on 5 November 2026 before product implementation in this preparation branch.

## Existing sources

Primary base: `AjnasNB/guardchain.ai`, commit `370a135a7eb1fa883a4fca00111a3a8c2e5c226b`.

Historical comparison: `AjnasNB/bnb`, commit `a940d9fc4bd51b2e3d854ea08ee7a3ac5c84709e`.

The inherited product includes a Next.js UI, NestJS/SQLite backend, FastAPI evidence service, custom accounting token, governance token, policy NFT, claims engine, governance and surplus contracts. The newer repository includes additional jury, weighted-tally and appeal components. Existing documentation and demo assets are also pre-existing work.

## What this preparation adds

Planning documents, isolated dependency manifests and locks, public test wallet metadata and setup evidence. Dependency installation does not implement the product. No application source or Solidity contract changes are part of this stage. The existing history is preserved on `prep/ethglobal-mumbai`.

## New work proposed for the event

- Arc Studio project and Arc-native USDC integration.
- Independently governed cooperative treasuries and request-specific shared escrow.
- Actual commitments, capped payout, expiry/refund and advance recovery.
- Arkiv entities plus a user-facing discovery query.
- Encrypted Swarm evidence upload and authorized retrieval.
- Uniswap contribution conversion connected to settled Arc credit.
- Repair of inherited mock paths and verified transaction status.
- End-to-end tests, new role views, demo and submission evidence.

These are planned functions, not completed claims. Record new commits and evidence as each item works. Preserve the distinction between inherited features, repairs and genuinely new functionality.

## Required submission wording

Identify the base repository and commit in the written Continuity submission. Describe the original community insurance prototype and list the new event additions. Provide the new implementation's commit range and reproducible receipts. Keep AI-assisted specifications and generated work attributable. Confirm Continuity selection with the organizer/dashboard before claiming eligibility.

No repository is made public, pushed, licensed under a new grant or submitted by this preparation. Open-source licensing of the event work and any source release remain part of submission readiness.

Source: [ETHGlobal pre-existing work rules](https://ethglobal.com/rules).

## Implemented event scope

The headings above preserve the original preparation snapshot. The final prototype demonstrates one cooperative, with no cross-cooperative escrow or lending. The new implementation spans `5128632` through `5ccf35b`: Arc-native USDC coverage, independent appeals and prospective governance, private claims and the redesigned Cloudflare app, queryable Arkiv records with encrypted Swarm evidence, and the confirmed Uniswap-to-Arc contribution. See the [demo runbook](DEMO_RUNBOOK.md) for receipts and [submission draft](SUBMISSION_DRAFT.md) for the remaining eligibility and publication gates.
