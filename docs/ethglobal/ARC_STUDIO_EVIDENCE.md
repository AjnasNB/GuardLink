# Arc Studio Continuity Track · Bring Your Project to Arc

GuardLink extends an earlier cooperative coverage prototype with an Arc Testnet pool, USDC contributions, policy NFTs, governed claims and on-chain settlement. The event implementation starts at original commit `5128632`, after the disclosed baseline `370a135a7eb1fa883a4fca00111a3a8c2e5c226b`. [Continuity baseline](CONTINUITY_BASELINE.md) · [Original event history](../../EVENT_HISTORY.md) · [Official prize criteria](https://ethglobal.com/events/mumbai/prizes#arc)

The [Arc Studio owner workspace](https://studio.arc.io/app/5b1cd267-eb2b-4f67-82cf-0f0d2b15252d) contains the contract implementation and deployment. The workspace URL redirected to sign-in in a signed-out browser. Judge access to that workspace still needs confirmation from Circle or ETHGlobal.

The [public Arc Studio share](https://studio.arc.io/share/arc-integration-deployment-sandbox-5d41cde3zs) opens the conversion sandbox without a login. If the embedded app is blocked, use **Open app** or go directly to the [Vercel preview](https://arc-studio-5b1cd267eb2b4f6782cf0f0d2b15252d-ajnasnbs-projects.vercel.app/). The preview reads GuardLinkPool on Arc Testnet and displays the demo member’s live policy count. It provides public access to the app preview; the source and deployment workspace still has separate access controls.

On November 7, 2026 (IST), a dedicated demo member wallet called the same `contribute()` method as the live app and paid **1 test USDC**. [The confirmed contribution](https://testnet.arcscan.app/tx/0x3ea87ce7dd5b3b875b99594043a6ca98dfb10fc1f79c38b885bb88c502e7be29) issued **Policy #7** in block `71099728`. Arc RPC confirmed ownership, the [public ledger](https://guardlink.ajnasnb.com/ledger/) lists the receipt, and the Studio-hosted preview showed the member’s policy count rise from **3 to 4** after reload. The preview shows the count, while the ledger and explorer show the individual transaction.

This direct Arc contribution did not use a bridge. The sandbox’s separate mock-token route still shows no Ethereum Sepolia bridge receipt. The [demonstrated Uniswap v3 and CCTP route](CONVERSION_RUN.md) used **Base Sepolia** and issued **Policy #3**.

![GuardLinkPool in the Arc Studio Contracts workspace](arc-studio-deployment.jpg)

The active contract in the capture is [GuardLinkPool on Arc Testnet](https://testnet.arcscan.app/address/0x335d2ce0c397016ac0e1d6930eb98a1dfe47c895). Its [creation receipt](https://testnet.arcscan.app/tx/0x7e2bc3db994a3698ebd612e8d22dbd212b36b486f4f4f37dfccea4b62da78326) and [confirmed 0.25 test USDC payout](https://testnet.arcscan.app/tx/0xd49c157356415074b0351ca974740dfb4878fca95575eb28dc79fbfa8a157f63) are public. The [verified source evidence](source-verification.json) records the bytecode matches. [Open the live GuardLink testnet app](https://guardlink.ajnasnb.com).

| Judge requirement | GuardLink evidence |
| --- | --- |
| Arc Studio workspace and video | [Public Studio share](https://studio.arc.io/share/arc-integration-deployment-sandbox-5d41cde3zs), [owner workspace](https://studio.arc.io/app/5b1cd267-eb2b-4f67-82cf-0f0d2b15252d), screenshot above, and Studio Contracts view at **2:41** in the uploaded demo. Judge access to the owner workspace requires confirmation. |
| Working frontend and backend | [Live app](https://guardlink.ajnasnb.com/), [backend health](https://api.guardlink.ajnasnb.com/health), and [public settlement ledger](https://guardlink.ajnasnb.com/ledger/). |
| Architecture and presentation | [Architecture diagram](ARCHITECTURE.md), [pitch presentation](../../deliverables/GuardLink-Pitch.pptx), and [demo runbook](DEMO_RUNBOOK.md). |
| Public source and validation | [Public MIT repository](https://github.com/AjnasNB/GuardLink), [USDC contribution](../../onchain/contracts/GuardLinkPool.sol#L232), [payout settlement](../../onchain/contracts/GuardLinkPool.sol#L442), and [contract test log](contract-test-results-current.txt). |

Circle tools used in the demonstrated flow include Arc Testnet, canonical USDC for reserve and settlement, and CCTP for the optional USDC arrival from Base Sepolia. [Verified contribution route](CONVERSION_RUN.md)

## Source cross-check

On November 6, 2026, we compared the public Solidity source with the Arc Studio pull recorded for `contracts/GuardLinkPool.sol`. The local export has SHA-256 `ddd4d986cb5d1e16f81484d05816c750383e435d42f879d146380b1a4ad489e7`, matching the pull manifest. The GitHub file matches the Solidity source returned by Sourcify. Sourcify reports creation and runtime matches, and Arc RPC returned the runtime bytecode recorded by Sourcify. We also confirmed the deployment receipt and read the owner of Policy #4 directly from Arc.

[Solidity source](../../onchain/contracts/GuardLinkPool.sol) · [Sourcify verification](https://repo.sourcify.dev/5042002/0x335d2ce0c397016ac0e1d6930eb98a1dfe47c895) · [Backend health](https://api.guardlink.ajnasnb.com/health)
