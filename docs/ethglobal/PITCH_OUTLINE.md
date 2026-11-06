> Historical preparation snapshot. The live GuardLink cooperative implementation and current evidence supersede this earlier RiskMesh proposal. See [the project README](../../README.md) and [the demo runbook](DEMO_RUNBOOK.md).

# RiskMesh presentation and demo outline

This is the planned PPTX narrative. The finished deck and recording follow the working prototype, so screenshots and transaction claims can reflect what actually runs. Use the original GuardChain deck as a reference for the story and community roots; make the final product identity consistent. Do not spend presentation time listing historical chains.

## Slide 1 The healthcare funding problem

One sentence: Communities should be able to organize healthcare help and understand where their money goes.

Spoken opening, about 15 seconds: explain the experience of repeated paperwork after the family's medical treatment and waiting for reimbursement. Use the factual account already present in the original pitch. Avoid unsupported claims about every insurer or guaranteed response times.

## Slide 2 A year of conversations

Explain direct conversations with Kudumbashree participants, forms shared through community contacts and students, and interest collected from families. Add only verified counts. Show no names, phone numbers or raw responses. This establishes discovery and the origin of the idea.

## Slide 3 The local cooperative

Members contribute to their own community fund. A member holds an NFT policy record, submits evidence privately, receives a clear review and an approved wallet payout. Human reviewers remain accountable for the decision.

The NFT is a policy record. Public metadata contains no medical details. Contributions fund assistance; issuing an NFT creates no money.

## Slide 4 Help between cooperatives

Explain the new feature with the demo's 5 test USDC case: A commits 1.5, B commits 2 and C commits 1.5. Each group decides independently. Their funds meet in a request-specific escrow. The member receives exactly the agreed amount.

## Slide 5 Agent assistance and human decisions

Show an evidence summary with source fields and missing-document flags. Explain how the workflow prepares a request and follows its progress. Humans approve spending; contracts enforce amount, recipient and deadlines. Do not describe the score as a proven fraud probability.

## Slide 6 Settlement and repayment

Show one actual payout receipt. Explain the distinction between a grant and an advance. For the advance demo, a 3 USDC repayment returns 0.9, 1.2 and 0.9 to the contributing cooperatives. Unpaid principal remains outstanding, not available cash.

## Slide 7 Why this infrastructure

Use one editable architecture diagram. Arc settles money. Arkiv makes public-safe funding requests discoverable between independent groups. Swarm stores encrypted evidence. Uniswap converts supported contribution assets before settled reserve credit. Include Arc Studio as the development environment for the Arc module.

## Slide 8 What works and what comes next

Show only completed prototype functions. Then identify future INR/USD on/off-ramps, easier wallet onboarding and a consent-based cooperative pilot. Real insurer reimbursement integration is a separate future arrangement.

## Three-minute recording sequence

| Time | Content |
| --- | --- |
| 0:00–0:20 | Personal problem and community research |
| 0:20–0:40 | Member policy NFT and contribution |
| 0:40–1:10 | Synthetic claim, private evidence and evidence-linked AI review |
| 1:10–1:45 | Local approval, Arkiv discovery and second cooperative commitment |
| 1:45–2:10 | Confirmed Arc payout to member, followed by a rejected duplicate attempt |
| 2:10–2:35 | Partial repayment and correctly updated fund balances |
| 2:35–2:50 | Uniswap contribution route and actual destination credit |
| 2:50–3:10 | Arc Studio, architecture and next pilot step |

Use readable text and the same case ID throughout. Edit out idle waits without speeding up the recording. If a sponsor action happens outside this sequence, include its timestamp in the supporting README. Keep the result under four minutes.

## Public narrative and Continuity disclosure

The public opening may say: “I have spent the last year exploring this with families and self-help-group participants.” The technical submission separately identifies inherited code and exactly what changed during Mumbai. Never describe the entire inherited application as newly built at the event.
