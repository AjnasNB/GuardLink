# GuardLink testnet demo verification

Verified November 6, 2026. The wallet-based cooperative workflow is ready to demonstrate on the live testnet deployment with the prepared synthetic claims and demo wallets.

| Check | Result |
| --- | --- |
| Live frontend | Cloudflare version `58ad711b-1097-4049-a093-c43128c1da83`. Verified the signed-in claims table and keyboard navigation in Chrome. At a 390 px viewport, both claims rendered as cards and the page width stayed at 390 px. |
| Wallet and access controls | Five distinct role signatures worked. Unrelated members and unassigned helpers were denied private evidence. The assigned reviewer retrieved it. Organizer access was limited to the designated operator. |
| Claims and Arc settlement | Three confirmed payouts of 0.50, 0.40 and 0.25 test USDC matched the claim IDs and on-chain events. Duplicate settlement reverted in simulation. The appeal used a distinct jury. |
| Governance | The executed proposal recorded nine votes for and zero against. Future coverage is 6 test USDC. The earlier policy retained its 5 USDC limit. |
| Uniswap and CCTP | Verified the Base Sepolia swap of 0.001 WETH to 2.243326 USDC, the Arc arrival of 1.096341 USDC, and the separate 1 USDC contribution that issued policy #3. |
| Arkiv and Swarm | The case-scoped Arkiv query returned 14 records, including the paid receipt and the matching Swarm ciphertext reference. The authorized bill matched its SHA-256. The public gateway returned encrypted bytes, and the private evidence URL returned HTTP 401 without a session. |
| Build and tests | Seven domain and privacy tests passed. Worker TypeScript check and production Next.js build passed. The live audit rechecked existing receipts and reads without sending new chain transactions. |
| Main demo video | The 3:44, 1080p demo with founder narration is saved in the draft. The [partner handoff](SUBMISSION_HANDOFF.md) identifies the relevant frames. |
| Brag cut | The separate 20-second 1080p launch cut shows the missing document and actual Arc payout receipt. It decoded fully. It uses text and real testnet visuals in a silent social preview. |

Use the [live runbook](DEMO_RUNBOOK.md) to present. The detailed evidence is in [live verification](live-verification.json), the [contribution verification guide](CONVERSION_RUN.md), and the [Swarm integration notes](../../arkiv/swarm.md).

The demo uses wallet sign-in. The event repository is public under MIT and the Uniswap feedback form has a recorded confirmation. The open prize items are judge access to the Arc Studio workspace and the Swarm postage batch and buyer or provider attribution. [Submission handoff](SUBMISSION_HANDOFF.md) · [Official partner requirements](https://ethglobal.com/events/mumbai/prizes)
