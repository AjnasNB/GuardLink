# GuardLink demo runbook

## Four-minute judging walkthrough

Open the [public GuardLink homepage](https://guardlink.ajnasnb.com/#results), the [public claim timeline](https://guardlink.ajnasnb.com/transparency/?caseId=dfd3e4f9-9008-4e60-b420-f10ae15c5f81), and the [Arc Studio share](https://studio.arc.io/share/arc-integration-deployment-sandbox-5d41cde3zs). Keep the [video backup](https://guardlink.ajnasnb.com/demo-video/) handy. If the wallet or a testnet service is slow, switch to a completed claim and its receipt.

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:30 | Founder story and outreach | “After my father’s surgery, our family borrowed while waiting for reimbursement. We had the paperwork and still couldn’t see what was blocking the claim. That experience led to a year of community outreach and an earlier cooperative prototype. At Mumbai I brought that work to Arc.” |
| 0:30–1:45 | Coverage, then claim C in the member app | “A contribution creates the coverage record. GuardLink requests the missing prescription under the same case. The evidence assistant cites what it finds, and two human jurors have to agree on the decision and amount.” |
| 1:45–2:40 | Homepage results, payout receipt and independent appeal | “The figures come from confirmed Arc events. Open a receipt to see the payout. Ravi Thomas is a fictional test case that was initially rejected and then paid 0.35 test USDC after a separate panel reviewed the appeal.” |
| 2:40–3:35 | Studio preview, Arkiv timeline and Swarm evidence, then the conversion receipts in My coverage | “Arc enforces payment and policy rules. Arkiv indexes public milestones. Swarm holds encrypted evidence. Uniswap v3 converts the contribution asset before USDC is bridged and deposited into the pool.” |
| 3:35–4:00 | Live results and next milestone | “We have a working testnet claims path. The next pilot milestone is independently verifying member identity, treatment and billing before releasing real funds.” |

**Why blockchain?** The cooperative can check the terms, votes, and USDC settlement against a shared contract and public receipts. Source verification and medical review happen separately. A receipt proves the payment happened.

**What if a doctor, member and jurors collude?** The contract checks policy ownership, amounts and authorized votes. Two colluding jurors can still approve a false claim within those rules. Before a real pilot, independently verify identity and wallet control, obtain the invoice through an authorized hospital records or billing channel, check repeat invoices, and require a reviewer outside the local panel to clear flagged claims. Keep sensitive evidence private and give the member a route to correct errors or appeal.

**What was built during Mumbai?** The research, cooperative insurance idea and prior prototype predate the event. Mumbai added the Arc Testnet settlement and coverage flow, the current evidence workflow and independent appeals, prospective governance, Arkiv and Swarm, and the confirmed Uniswap-to-Arc route. The two extra synthetic claims and automatic homepage totals are follow-up demonstrations. The submitted recording shows the original Mumbai flow. [Continuity baseline](CONTINUITY_BASELINE.md)

**What happens when the reserve is short?** An approved claim can remain awaiting funds. The contract records the amount and settlement status, and a confirmed receipt is the proof of payment. Testnet amounts demonstrate the flow. A real pilot still needs funding rules and an operating partner.

## A public walkthrough

Open https://guardlink.ajnasnb.com. The API runs on Cloudflare too; normal member use does not require localhost. Choose a separate MetaMask test account, select Arc Testnet and sign in. A sign-in message does not authorize a transfer. If the wallet account changes, sign out and sign in again.

Network settings: chain ID **5042002**, RPC `https://rpc.drpc.testnet.arc.io`, native currency **USDC**, 18 native decimals. The canonical ERC-20 USDC interface at `0x3600000000000000000000000000000000000000` uses 6 decimals and represents the same underlying balance. Test assets from a different network do not become Arc funds automatically.

For your own new account, use the official Circle faucet's Arc Testnet option within its limits. Alternatively run `node scripts/fund-test-wallet.mjs YOUR_PUBLIC_TEST_ADDRESS` locally: it tops the chosen address up to 2 test USDC, only on chain 5042002, using the encrypted deployment wallet. It never prints a private key. After requesting membership, the designated operator verifies this explicitly labelled test identity.

Do not import the deployment account into MetaMask. To demonstrate existing test identities without moving private keys into Chrome, run:

```powershell
node scripts/open-demo.mjs member-a
```

Open the printed local loopback link within 60 seconds. It redirects to the public HTTPS app with a one-use handoff. This helper signs locally; it does not install a browser wallet or authorize browser transactions. Use the CLI for existing-actor transactions, or a separately funded MetaMask account for an interactive signing demonstration.

Repeat with `member-b`, `contact`, `juror-1`, `juror-2`, `juror-3`, `appeal-1`, `appeal-2`, or `appeal-3`. Public addresses and synthetic role names are in `demo-actors.public.json`. Account cookies are shared within one Chrome profile: switching identity changes that profile's session. Use separate Chrome profiles for simultaneous role windows. Do not label the wallets independent human users.

For the recording, start `node scripts/demo-switcher.mjs` before sharing your screen. Open [Demo roles](http://127.0.0.1:8899/) on the provisioned Windows machine. Choose a role; use Chrome Back to return to the role picker. This signs into GuardLink with its test identity, and leaves the existing MetaMask account unchanged. Refresh any other app tab before showing it. The picker is local-only, runs for up to two hours, and cannot sign a vote or a payment from the browser.

| Role | Screen to show |
| --- | --- |
| Member `0x6E70…ebF6` | [Overview](https://guardlink.ajnasnb.com/app/), [My coverage](https://guardlink.ajnasnb.com/app/coverage/), then [claim GL-377CFC03](https://guardlink.ajnasnb.com/app/claims/377cfc03-c98d-4e89-bb99-178fd6811a2e/) for the same-ID prescription follow-up. |
| Claim juror `0x1106…Ff8B` | [Review cases](https://guardlink.ajnasnb.com/app/review/), then [pending case GL-004FB7B7](https://guardlink.ajnasnb.com/app/claims/004fb7b7-21cf-4502-bcb8-7414cbbc0a7f/). Show the 0.26 bill, the 0.22 recommendation, the INR reference, and the editable amount and reason. Don't submit unless the matching Arc Testnet signing wallet is connected. |
| Appeal juror `0xB1e9…201f` | [Review cases](https://guardlink.ajnasnb.com/app/review/), then [case GL-908E7617](https://guardlink.ajnasnb.com/app/claims/908e7617-2163-4cde-a562-f42d775c1501/) for the two panels and confirmed payment. |

For newly analyzed claims, the suggested amount is the smallest of the supported test-USDC bill, requested amount and coverage remaining at the Arc check. A missing, ambiguous or unreadable amount gives no suggestion. Reviewers can enter a different amount and give a reason. An exact match to the [State Health Agency Kerala package master](https://sha.kerala.gov.in/?page_id=157&lang=en) can show a dated INR reference for a supported procedure code; it never sets or converts the test-USDC amount. Existing analyzed cases retain their original results.

Live verification: [claim registration](https://explorer.testnet.arc.io/tx/0xf9d4c5d3c7698a4955a162f47f1dc79441743a1b8da7c84636bf73bf2fc6a983) and [jury assignment](https://explorer.testnet.arc.io/tx/0xa6552bbbdfea905973114daac9e57fb9eb1ed86118e5c70419673fcaa48bc30e) confirmed on Arc Testnet. In Chrome, the assigned juror changed 0.22 to 0.18 without submitting. No vote or payment was sent for this case. To prepare another synthetic pending case, the provisioned operator can run `node scripts/live-claims.mjs --prepare-recommendation` with `GUARDLINK_DEMO_DEPLOYMENT_ROOT` pointing to the local deployment directory. This sends testnet registration and assignment transactions only.

## What to show

### Live jury practice

Three additional synthetic cases were prepared on Arc Testnet on November 7. Each has a bill, discharge summary, prescription, evidence recommendation and an assigned three-person demo panel. The [rehearsal receipt manifest](jury-rehearsal.public.json) records their registration and assignment receipts.

| Case | Suggested test USDC | Recorded practice ballots |
| --- | --- | --- |
| [GL-BB55EB1B, itemized hospital bill](https://guardlink.ajnasnb.com/app/claims/bb55eb1b-c56c-4418-8ef9-57c7314bec83/) | 0.22 | Zero at verification |
| [GL-057BB5BD, post-surgery follow-up](https://guardlink.ajnasnb.com/app/claims/057bb5bd-f8a6-44d5-a9b2-4be7c0c08202/) | 0.18 | One approval from demo juror 2 |
| [GL-7785B481, outpatient reimbursement](https://guardlink.ajnasnb.com/app/claims/7785b481-d9f6-4dff-8fe1-bb40a08bf843/) | 0.20 | Zero at verification |

Use the local role picker to select **Claim juror**, open **Review cases**, choose a case and scroll to **Your review**. Inspect the private synthetic evidence and expand **Review AI findings**, then choose a decision, enter the supported amount and give a reason. **Sign and record my vote** requires the browser wallet to match the signed-in assigned reviewer. The local role picker supplies a viewing session. To use your own MetaMask account for a ballot, sign in with that account, request and confirm community membership, and have the operator verify and assign it to a case before any ballot on that panel.

The recorded practice ballot used the existing encrypted demo juror 2 signer through the CLI. Its successful receipt, amount, reason hash and API projection were checked. Duplicate and unassigned votes were rejected in contract calls. The [public practice ballot](https://guardlink.ajnasnb.com/ledger/votes/?kind=jury-votes&claim=0x36cc978748725e560fae4066ec083208eb087985e488309b5d3bfd50d2b68eab) can be shared with judges without a private session. All three cases were still awaiting a jury outcome at verification.

1. Member A: My coverage shows policy #1, contribution and remaining limit. My claims opens paid case A with three synthetic documents and an AI-assisted evidence recommendation.
2. Member B: case B shows the appealed, paid case and its receipt. Explain the distinct initial and appeal panels from the chain ledger.
3. Assigned juror: Review cases lists only assigned cases. A live pending case provides the decision form; a resolved case cannot receive another vote.
4. Contact: receives no medical access by role alone. Before jury assignment, a claimant can explicitly authorize a helper for that case. The chosen helper is excluded from its jury.
5. Cooperative setup: only the designated on-chain operator wallet can verify members or assign panels. Operator access does not grant medical evidence access.
6. Community votes: inspect the executed proposal, nine supporting votes and preserved old policy terms. Future coverage is now 6 test USDC. Do not pretend the executed proposal is still accepting votes.
7. My community: current contribution, limit and duration come from chain reads.
8. Follow the fund: public status records contain no medical evidence. The live view reads Arkiv. Open a claim’s “Follow public milestones” link for its case-scoped query. The all-record view also includes the verified coverage agreement and DAO outcome.

Use `node scripts/live-claims.mjs` only to resume the existing cases; it preserves paid-case receipts. `node scripts/live-governance.mjs` preserves the executed proposal. These scripts send actual testnet transactions when a step is incomplete. `node scripts/verify-live.mjs` verifies receipts, private access, operator gating and current terms without sending chain transactions. `node scripts/arc-demo.mjs` can top up labelled actors and enrol them; it does not reset governance.

For a fresh browser case, contribute for coverage, create a synthetic claim, upload `fixtures/synthetic/bill.pdf` and `discharge_summary.pdf`, request preparation, then upload the prescription under that same case. PDFs clearly identify themselves as synthetic. Never upload real family medical records into this hackathon environment.

## Evidence and pending work

The Mumbai recording covers payouts of 0.50, 0.40 and 0.25 test USDC and an executed nine-voter proposal. The follow-up run added [Anitha’s 0.20 payout](https://testnet.arcscan.app/tx/0x69662d2f327881675bf2ade8560d356e88c93e59ce95f06f1452c57901fbb3b5) and [Ravi’s 0.35 payout after appeal](https://testnet.arcscan.app/tx/0xd7e2bc7ee2d7178489df9b82d0d5588597d903b4e2fb6a7cb2a888ac8b12d8e7). Both are fictional cases processed with synthetic evidence. The script checked the recipient balances and duplicate payout protection. Contract source verification matches creation and runtime. The contract suite has 185 tests, and the domain/privacy suite has seven tests. [Run ledger](demo-run.public.json)

Arkiv and Swarm are live and linked. The public Swarm gateway does not disclose actual postage batch provenance; obtain it before representing the bonus paperwork as complete. The Base Sepolia Uniswap swap, CCTP transfer and separate Arc deposit have successful receipts and policy #3. View the verified example in My coverage. Email OTP still awaits provider setup.

## Recording

The live walkthrough records the public app and a new synthetic test case, `GL-377CFC03`. The checklist opened a prescription request for the existing member and case. The member added the prescription and requested analysis in Chrome. Azure returned five findings, the same request was marked answered, and the case became ready for review. The testnet signers registered the case and assigned the panel. The recording shows the assigned juror's form, the two recorded approvals, and the [confirmed 0.25 test USDC payout](https://testnet.arcscan.app/tx/0xd49c157356415074b0351ca974740dfb4878fca95575eb28dc79fbfa8a157f63). The exact wallet balance increase and duplicate settlement rejection were checked. See the [receipt ledger](demo-run.public.json) and [live verification](live-verification.json).

The final 3:44 video includes the founder’s spoken track. Use the [GuardLink video player](https://guardlink.ajnasnb.com/demo-video/) if the public ETHGlobal player is unavailable.

## Four partner proofs for the live demo

Before presenting, run `node scripts/open-demo.mjs member-a` from the repository root and open the one-use local link. Preload the following tabs. The walkthrough uses completed testnet examples and does not require a new swap, payout or wallet approval.

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:45 | [My coverage](https://guardlink.ajnasnb.com/app/coverage/). Expand **Follow the test contribution and its receipts**. | “On Base Sepolia, Uniswap v3 swapped 0.001 WETH into 2.243326 test USDC. CCTP delivered 1.096341 USDC to Arc. A separate one-USDC deposit issued policy #3.” |
| 0:45–1:45 | [Paid claim C](https://guardlink.ajnasnb.com/app/claims/377cfc03-c98d-4e89-bb99-178fd6811a2e/), then [Arc payout receipt](https://testnet.arcscan.app/tx/0xd49c157356415074b0351ca974740dfb4878fca95575eb28dc79fbfa8a157f63). | “The missing prescription went back into the same claim. Two jurors approved it. GuardLinkPool paid 0.25 test USDC, and we checked the recipient balance.” |
| 1:45–2:10 | [Arc Studio](https://studio.arc.io/app/5b1cd267-eb2b-4f67-82cf-0f0d2b15252d) → **Contracts** → **GuardLinkPool.sol** → Arc Testnet deployment **0x335d…c895**. | “This is the Studio workspace where I built and deployed the settlement contract. The deployment address is the same as the contract in the payout receipt.” |
| 2:10–2:45 | [Claim A's public timeline](https://guardlink.ajnasnb.com/app/transparency/?caseId=dfd3e4f9-9008-4e60-b420-f10ae15c5f81). Point to the paid record and evidence archived entries. | “This is a live Arkiv query scoped to one case. It returns public milestones and the payment receipt. The document itself stays private.” |
| 2:45–3:30 | [Claim A](https://guardlink.ajnasnb.com/app/claims/dfd3e4f9-9008-4e60-b420-f10ae15c5f81/) → **Private documents** → **bill · Encrypted archive**. If the browser downloads the PDF, open that download. | “The signed-in member can open the synthetic bill. We checked that the PDF matches the original SHA-256, the public Swarm gateway returns ciphertext, and the same file URL rejects an anonymous request.” |

Use the confirmed Base Sepolia receipts in GuardLink for Uniswap. The Studio workspace also contains an older Ethereum Sepolia mock preview. In Studio, open the Contracts panel and use the deployment identified above. Its owner session was verified. Confirm judge access separately before submission.

In the uploaded 3:44 demo with founder narration, the Uniswap receipts are visible at **1:03**, the Studio workspace at **2:41**, the Arkiv timeline at **3:10**, and the linked Swarm archive at **3:20**. The [partner handoff](SUBMISSION_HANDOFF.md) links the reproducible evidence and identifies the remaining access and postage requirements.
