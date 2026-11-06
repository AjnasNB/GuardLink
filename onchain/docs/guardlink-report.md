# GuardLink verification report

## Deployment status (current)

Deployed to Arc Testnet (chain 5042002) on 2026-11-05 through the Studio sandbox deployer. No host private key was requested or used.

- Address: 0x335d2ce0c397016ac0e1d6930eb98a1dfe47c895
- Tx: 0x7e2bc3db994a3698ebd612e8d22dbd212b36b486f4f4f37dfccea4b62da78326
- Constructor args: admin 0xeb010023C8c20FA1E1A849373E36bf9B1f82DE11, token 0x3600000000000000000000000000000000000000, contribution 1000000, coverage 5000000, term 30 days.
- Read back onchain: admin, token, contributionAmount = 1000000, coverageLimit = 5000000, termDays = 30, deploymentSigner = 0xa3039A54856ed74B5AEc999EeF3fc954Ab010Cf6.
- Runtime size 20,076 bytes (limit 24,576).
- Superseded earlier deployment (10/100/30, no early execution): 0x9af34dd823f57a97e296223bce90987ad8f811c4.
- Not done: live-chain integration tests (the admin is the spec's bootstrap address, which the sandbox does not control), explorer source verification.

## Change in this revision

executeProposal may run before the 72h deadline only when yes + no equals the snapshot's eligible count, and the 50% quorum and 2/3 support checks still pass. Otherwise it reverts TooEarly before the deadline. Claims, jury, appeal and payout code is unchanged.

## Review (balanced)

- Earlier rounds: claim-ID front-running and aggregate-solvency settlement findings were fixed.
- This change: both reviewers returned no material findings.
- Slither (previous source, no High or Medium-impact issues) was not re-run on this one-line change.
- A review is not a substitute for a paid third-party audit. Demo only.

## Tests (full suite, final source)

152 passed, 0 failed, 0 skipped (12 suites).

| File | Passed |
|---|---|
| GuardLinkPool.t.sol | 12 |
| GuardLinkPool.Appeal.t.sol | 16 |
| GuardLinkPool.Claims.t.sol | 15 |
| GuardLinkPool.Fuzz.t.sol | 6 |
| GuardLinkPool.Gov.t.sol | 15 |
| GuardLinkPool.Invariant.t.sol | 3 |
| GuardLinkPool.Jury.t.sol | 26 |
| GuardLinkPool.NFT.t.sol | 7 |
| GuardLinkPool.Reentrancy.t.sol | 2 |
| GuardLinkPool.Settle.t.sol | 9 |
| GuardLinkPool.Treasury.t.sol | 10 |
| GuardLinkPool.EarlyExec.t.sol (new) | 31 |

New early-execution coverage: any missing vote (1 to 7 of 8, including when quorum and support would already pass) reverts TooEarly; unanimous early execution for rules and treasury proposals; all voted with insufficient yes (2 of 4, 3 of 5, all no) reverts ProposalNotPassed; a member revoked after the snapshot can complete the set; a member verified after the snapshot cannot vote or fill a gap; a revoked non-voter still counts as missing; double execution reverts; deadline path and voting-after-deadline unchanged; four fuzz tests. One existing test (`test_Execute_OnlyAfterDeadline`) was updated because it had every member vote and expected TooEarly.

Known limits: settlement and treasury payouts do not check fee-on-transfer behaviour (USDC has none); behaviour against real USDC blacklisting is untested.
