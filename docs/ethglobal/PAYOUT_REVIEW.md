# Payout review after jury approval

`GuardLinkPoolWithChallenges` is a separate contract version. The immutable Mumbai pool and its receipts use the original terms. Test the new version in an isolated pool before onboarding members under the new terms. Existing policies and claims belong to their original pool.

1. The assigned jury has 72 hours to vote. Two matching decisions resolve the round.
2. Approval starts a 48-hour hold. A verified community member outside the claim can flag the approval from its public case timeline. The chain records a reason category, and medical evidence stays private.
3. One flag sends the case to an independent panel. The claimant, designated helper, challenger and original jurors cannot sit on it. The panel can uphold, reduce or reject the provisional payment. The pool keeps the disputed amount reserved during review. A review that expires without a decision leaves the claim unresolved and releases the reservation when someone calls `releaseExposure`.
4. The independent decision is final. An approval starts a 48-hour settlement hold. Once the hold expires, any caller can submit `settle`. The contract sends the approved amount only to the claimant’s wallet when the pool has sufficient funds. A keeper can submit the same permissionless transaction on a schedule.

A claimant still has 72 hours to appeal an initial rejection. The independent panel follows the same voting rules, and an approval after that appeal has the same 48-hour settlement hold.

The app reads the hold from Arc. Authorized claim participants see voting deadlines, and eligible members see the flag action on the public timeline while signed in. The contract is authoritative for both deadlines and eligibility.
