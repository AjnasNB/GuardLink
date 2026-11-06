# GuardLink Arc integration

GuardLinkPool is a demo cooperative-insurance pool on Arc Testnet (chain 5042002) paid in USDC. Members join, the bootstrap admin verifies them, they contribute to receive a nontransferable policy NFT, file privacy-preserving claims (only commitments are onchain), a three-juror panel decides, and approved claims are paid to the claimant by anyone calling settle. Rules and limited treasury transfers are changed by member proposals.

Built with [Arc Studio](https://studio.arc.io)

Labelled demo: membership, jury rosters and verification are centralised in the bootstrap admin. The pool makes no Sybil-resistance or unbiased-randomness claim. Records are pseudonymous, not anonymous.

## Deployment (Arc Testnet)

Current deployment (approved demo terms):

- GuardLinkPool: `0x335d2ce0c397016ac0e1d6930eb98a1dfe47c895`
- Deployment tx: `0x7e2bc3db994a3698ebd612e8d22dbd212b36b486f4f4f37dfccea4b62da78326`
- Explorer: https://explorer.testnet.arc.io/address/0x335d2ce0c397016ac0e1d6930eb98a1dfe47c895
- Token: USDC `0x3600000000000000000000000000000000000000` (6 decimals)
- Bootstrap admin: `0xeb010023C8c20FA1E1A849373E36bf9B1f82DE11`
- Deployment signer (recorded separately, no admin rights): `0xa3039A54856ed74B5AEc999EeF3fc954Ab010Cf6`
- Initial parameters: contribution 1 USDC (1,000,000), coverage limit 5 USDC (5,000,000), term 30 days

Superseded (10/100/30 terms, before early proposal execution): `0x9af34dd823f57a97e296223bce90987ad8f811c4`, tx `0x98c2ebdeb6fa505f2c87f5cd559cad8f7e9ab9e8aabe64db5edcf9ab9700f851`. Do not use it in the app.

## Proposal timing

Voting stays open for a maximum of 72 hours. A proposal can be executed early only when every member eligible at the snapshot has voted and the usual quorum (50% rounded up) and support (2/3 rounded up) checks pass. With any vote missing, execution before the deadline is rejected. Members verified after the snapshot cannot vote, and a member revoked after the snapshot still counts as eligible.

## ABI and sources

- Contract source: `contracts/GuardLinkPool.sol`
- Test mock (not deployed): `contracts/mocks/MockERC20.sol`
- ABI: `docs/GuardLinkPool.abi.json` (mock ABI: `docs/MockERC20.abi.json`)
- Test and review report: `docs/guardlink-report.md`

## Claim ID mapping (refinement of the original spec)

The API UUID is unchanged. It maps to the onchain ID in three steps:

1. `clientId = keccak256(bytes(uuid))` (the client nonce)
2. `submitClaim(clientId, policyId, requestedAmount, incidentAt, evidenceCommitment)` returns `claimId`
3. `claimId = keccak256(abi.encode(claimant, clientId))`, also available as `computeClaimId(address claimant, bytes32 clientId)` (pure)

Every getter, jury assignment, vote, appeal, settlement and event uses the canonical `claimId`. `ClaimSubmitted` also emits `clientId` so the API can match its UUID. A different member using the same `clientId` produces a different `claimId`, so nobody can squat another member's claim. There is no admin bind step.

Interface deviations from the original spec:

- `submitClaim` returns `bytes32 claimId` and its first argument is a client nonce (user-directed).
- Added `setClaimContact(bytes32 claimId, address contact)`: the claimant records a local contact before a panel exists (no veto or decision power).
- Added `releaseExposure(bytes32)`, `proposeTreasuryTransfer(address,uint128,string)`, `treasuryTransfersSupported()`, `getProposal`, `getBallot`, `freeTreasury`, `committedPayouts`, `openClaimExposure`, `verifiedAt`, `deploymentSigner`.
- Claim status numbers: 0 None, 1 Submitted, 2 Voting, 3 Approved, 4 Rejected, 5 Unresolved, 6 Appealed, 7 AppealVoting, 8 Paid. Proposal kind: 0 Rules, 1 TreasuryTransfer.
- Rejection ballots must carry amount 0. Unassigned claims or appeals expire after 72 hours.
- Settlement is first-come: each claim needs the pool to hold its full approved amount; there is no partial payout and a short pool just makes settle revert so it can be retried.
- Treasury transfers: one governed transfer per proposal, capped at 10% of free treasury (balance minus approved-unpaid payouts minus open claim exposure). No admin withdrawal exists.

## Development

Prerequisites: Bun and Foundry.

```bash
bun install
bun run contracts:build
bun run contracts:test
bun run dev
```

Environment variables: None.
