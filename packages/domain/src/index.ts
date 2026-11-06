export type ClaimStatus =
  | "submitted"
  | "analyzing"
  | "needs_documents"
  | "ready_for_review"
  | "awaiting_jury"
  | "unresolved"
  | "under_review"
  | "approved"
  | "rejected"
  | "awaiting_funds"
  | "payment_pending"
  | "paid"
  | "appealed";
export type Role = "member" | "contact" | "juror" | "appeal_juror";
export type DocumentKind =
  "bill" | "discharge_summary" | "prescription" | "other";
export interface Evidence {
  id: string;
  kind: DocumentKind;
  name: string;
  sha256: string;
  swarmReference?: string;
  createdAt: string;
}
export interface Finding {
  code: string;
  message: string;
  evidenceIds: string[];
}
export interface Recommendation {
  summary: string;
  missing: DocumentKind[];
  findings: Finding[];
  recommendedAmount: string | null;
  evidenceIds: string[];
  source: "azure" | "checklist";
  revision: number;
}
export interface DocumentRequest {
  id: string;
  claimId: string;
  memberId: string;
  kinds: DocumentKind[];
  status: "open" | "answered";
  createdAt: string;
}
export interface Ballot {
  jurorId: string;
  approve: boolean;
  amount: string;
  reason: string;
}
export interface Claim {
  id: string;
  memberId: string;
  communityId: string;
  policyId: string;
  title: string;
  description: string;
  requestedAmount: string;
  incidentDate: string;
  status: ClaimStatus;
  documents: Evidence[];
  requests: DocumentRequest[];
  recommendation?: Recommendation;
  jurors: string[];
  votes: Ballot[];
  appealJurors: string[];
  appealVotes: Ballot[];
  appealed: boolean;
  contactId?: string;
  approvedAmount?: string;
  transactionHash?: string;
  chainClaimId?: string;
  revision: number;
  createdAt: string;
}
export const requiredDocuments: DocumentKind[] = [
  "bill",
  "discharge_summary",
  "prescription",
];
export function microUsdc(input: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(input))
    throw new Error(
      "Enter a positive USDC amount with at most six decimal places.",
    );
  const [whole, fraction = ""] = input.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}
export function formatUsdc(value: bigint): string {
  return `${value / 1_000_000n}.${(value % 1_000_000n).toString().padStart(6, "0")}`;
}
export function checklist(
  documents: Evidence[],
  revision: number,
): Recommendation {
  const missing = requiredDocuments.filter(
    (kind) => !documents.some((d) => d.kind === kind),
  );
  return {
    summary: missing.length
      ? "More evidence is needed before a reviewer can assess this case."
      : "Required document categories are present. A reviewer must still assess their contents.",
    missing,
    findings: [],
    recommendedAmount: null,
    evidenceIds: documents.map((d) => d.id),
    source: "checklist",
    revision,
  };
}
export function applyRecommendation(
  claim: Claim,
  recommendation: Recommendation,
  requestId: string,
  now: string,
): Claim {
  if (recommendation.revision !== claim.revision)
    throw new Error("Stale analysis revision.");
  if (!["submitted", "analyzing", "needs_documents"].includes(claim.status))
    throw new Error("This case is already in review.");
  const requests = claim.requests.map(
    (r) =>
      ({
        ...r,
        status: recommendation.missing.some((k) => r.kinds.includes(k))
          ? "open"
          : "answered",
      }) as DocumentRequest,
  );
  const open = requests.find((r) => r.status === "open");
  if (recommendation.missing.length && !open)
    requests.push({
      id: requestId,
      claimId: claim.id,
      memberId: claim.memberId,
      kinds: recommendation.missing,
      status: "open",
      createdAt: now,
    });
  else if (open) open.kinds = recommendation.missing;
  return {
    ...claim,
    recommendation,
    requests,
    status: recommendation.missing.length
      ? "needs_documents"
      : "ready_for_review",
  };
}
export function addEvidence(
  claim: Claim,
  memberId: string,
  evidence: Evidence,
): Claim {
  if (claim.memberId !== memberId)
    throw new Error("Only the claimant can add evidence.");
  if (!["submitted", "analyzing", "needs_documents"].includes(claim.status))
    throw new Error("Evidence is locked during voting.");
  if (claim.documents.some((d) => d.sha256 === evidence.sha256))
    throw new Error("This document has already been added.");
  return {
    ...claim,
    documents: [...claim.documents, evidence],
    revision: claim.revision + 1,
    status: "submitted",
  };
}
export function recordBallot(
  claim: Claim,
  ballot: Ballot,
  appeal = false,
): Claim {
  if (claim.status !== (appeal ? "appealed" : "under_review"))
    throw new Error("This case is not accepting votes.");
  const panel = appeal ? claim.appealJurors : claim.jurors;
  const votes = appeal ? claim.appealVotes : claim.votes;
  if (
    !panel.includes(ballot.jurorId) ||
    ballot.jurorId === claim.memberId ||
    ballot.jurorId === claim.contactId
  )
    throw new Error("You are not eligible to review this case.");
  if (votes.some((v) => v.jurorId === ballot.jurorId))
    throw new Error("Your vote is already recorded.");
  if (!ballot.reason.trim()) throw new Error("A decision reason is required.");
  if (
    ballot.approve &&
    (microUsdc(ballot.amount) <= 0n ||
      microUsdc(ballot.amount) > microUsdc(claim.requestedAmount))
  )
    throw new Error("Payout exceeds the claim or is zero.");
  const next = [...votes, ballot];
  const matching = next.filter(
    (v) =>
      v.approve === ballot.approve &&
      (!v.approve || microUsdc(v.amount) === microUsdc(ballot.amount)),
  );
  return {
    ...claim,
    [appeal ? "appealVotes" : "votes"]: next,
    ...(matching.length >= 2
      ? {
          status: ballot.approve ? "approved" : "rejected",
          approvedAmount: ballot.approve ? ballot.amount : undefined,
        }
      : {}),
  };
}
export function openAppeal(
  claim: Claim,
  memberId: string,
  jurors: string[],
): Claim {
  if (
    claim.memberId !== memberId ||
    claim.status !== "rejected" ||
    claim.appealed
  )
    throw new Error("One appeal is available to the member after rejection.");
  if (
    jurors.length !== 3 ||
    new Set(jurors).size !== 3 ||
    jurors.some(
      (j) =>
        claim.jurors.includes(j) || j === memberId || j === claim.contactId,
    )
  )
    throw new Error("An independent three-person appeal panel is required.");
  return {
    ...claim,
    status: "appealed",
    appealed: true,
    appealJurors: jurors,
    appealVotes: [],
  };
}
export function publicClaim(claim: Claim) {
  return {
    id: claim.id,
    communityId: claim.communityId,
    status: claim.status,
    requestedAmount: claim.requestedAmount,
    approvedAmount: claim.approvedAmount ?? null,
    transactionHash: claim.transactionHash ?? null,
    voteCount: claim.votes.length,
    appealVoteCount: claim.appealVotes.length,
    createdAt: claim.createdAt,
  };
}
