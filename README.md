# GuardLink · Protection, together

A cooperative health-insurance prototype inspired by the founder's experience with his father's delayed reimbursement and conversations with families in Kerala. Members contribute, receive a non-transferable policy NFT, submit evidence under one case ID, receive human jury review and follow an approved payment to their wallet. A rejected case can receive one independent appeal.

**Live testnet app:** https://guardlink.ajnasnb.com
**Public API:** https://guardlink-api.ajnasnb.workers.dev
**Arc Studio owner workspace:** https://studio.arc.io/app/5b1cd267-eb2b-4f67-82cf-0f0d2b15252d (requires access to the Studio project)

This is a testnet demonstration using synthetic medical evidence. It does not sell real insurance or establish sustainable pricing, clinical accuracy or a regulated operating model.

## Demonstrated behavior

- Nine separate, labelled demo wallets with distinct member, helper, initial-jury and appeal-jury roles. They represent test identities, not nine independent participants.
- Three confirmed contributions and policy NFTs, including one funded by a verified Uniswap-to-Arc route.
- A missing prescription requested and supplied under the same member/case ID.
- Azure-hosted evidence recommendations with document references. Humans hold all voting authority.
- A 0.50 test-USDC initial approval/payment and a 0.40 test-USDC rejection/independent-appeal/payment.
- A nine-voter DAO proposal increasing future coverage from 5 to 6 test USDC while existing policies retain their original limit.
- Public status projections omit identifying details and medical documents. Authorized evidence retrieval decrypts authenticated ciphertext.
- 185 contract tests passed with OpenZeppelin 5.6.1: 152 for the Arc pool and 33 for the mock contribution token. Both deployments have matching creation and runtime source verification.

Receipts and checks: [live verification](docs/ethglobal/live-verification.json), [run ledger](docs/ethglobal/demo-run.public.json), [source verification](docs/ethglobal/source-verification.json).

## Why these components

Arc enforces the pool's USDC contributions, coverage, jury authority, prospective governance and payouts. Its stablecoin-native model lets the demo use USDC for both contributions and gas. An independent ledger makes these rules and movements inspectable. It does not prove that a bill is genuine or that a juror is fair.

Arkiv holds wallet-owned, queryable public case, agreement and governance records with a 30-day expiry. Swarm holds encrypted evidence linked from Arkiv; an authorized read recovered the matching PDF. Uniswap v3 converted 0.001 WETH into 2.243326 USDC on Base Sepolia; CCTP moved 1.1 USDC to the Arc member, who made a confirmed 1 USDC pool deposit and received policy #3. See [the verified conversion](docs/ethglobal/contribution-route.base-sepolia.public.json), [Arkiv proof](docs/ethglobal/arkiv-verification.json), and [Swarm proof](docs/ethglobal/swarm-verification.json).

## Project structure

- `onchain/`: Arc Studio contract, ABI, deployment provenance, independent local tests.
- `packages/domain/`: exact USDC arithmetic, claims, follow-ups, jury rules and safe projections.
- `worker/`: Hono API, D1 migrations, retriable analysis Workflow and integration adapters.
- `frontend/`: Next.js/OpenNext UI deployed to Cloudflare Workers, including onboarding, coverage, claims, reviews, governance, transparency and guarded operator controls.
- `scripts/`: encrypted Windows-local demo identities, testnet-only funding and read-only live verification.
- `fixtures/`: synthetic PDFs only.

## Local setup

Use Node.js 22+ and npm. Secrets belong in ignored `.dev.vars` or Cloudflare secrets, never source files. Copy required variable names from the Worker configuration and bind your own D1 database. The deployed project uses Azure document analysis; email OTP requires a configured Privy application and verified server credentials. Wallet sign-in works independently.

```sh
npm ci
npm run db:local -w worker
npm run dev:api
npm run dev
npm test
npm run typecheck
```

For Cloudflare deployment, authenticate Wrangler, bind D1, apply migrations, upload secrets, then deploy the API followed by the web app:

```sh
npm run db:remote -w worker
npm run deploy:api
npm run deploy:web
```

Contract reproduction: [onchain/LOCAL_TESTING.md](onchain/LOCAL_TESTING.md). The live app uses the Worker API. Set your own Worker bindings, D1 database ID and optional analysis configuration before deploying this source.

## Demo and MetaMask

Play the local demo cut and record your narration separately using a desktop microphone. See [DEMO_RUNBOOK.md](docs/ethglobal/DEMO_RUNBOOK.md) for accounts, role switching, network settings, fixture uploads and exact receipt checks. Dedicated encrypted test-wallet keystores stay outside Git under Windows LocalAppData. Never import the deployment key into a browser or use a funded personal account for the walkthrough.

## Continuity and limitations

This continues `AjnasNB/guardchain.ai` from baseline `370a135a7eb1fa883a4fca00111a3a8c2e5c226b`. The inherited insurance concept, code, story and earlier demos are pre-existing work. The Arc contracts/USDC integration, Worker API, new interface and verified testnet flows are event additions. See [the full disclosure](docs/ethglobal/CONTINUITY_BASELINE.md). Public product branding is GuardLink; the original repository preserves the event history.

Bootstrap verification and panel assignment currently depend on a designated operator. The current evidence key is server-managed, and revoked reviewers' prior downloads cannot be recalled. A real launch needs independent security review, a lawful insurance operating structure, actuarial pricing, reserve management, consent and a real pilot. The dependency audit still reports unresolved upstream advisories; this deployment is a synthetic-data testnet prototype.

AI assisted code, artwork, test scaffolding and presentation/video preparation. The founder supplies the personal story and must record the official human narration. No verified partnership, insured-user count or winning probability is asserted.

## Public source export

This repository contains a reviewed snapshot of GuardLink event source at private project commit `cf28f9cd908377c24f44b88898db67891e6e2941`. It excludes historical services, personal or local deployment files, databases, private wallet files and logs. The [event commit manifest](EVENT_HISTORY.md) records the original chronology. The MIT license applies to GuardLink source in this export. Dependencies retain their own licenses.
