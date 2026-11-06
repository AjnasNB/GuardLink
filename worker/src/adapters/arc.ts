import {
  createPublicClient,
  http,
  keccak256,
  toBytes,
  encodeAbiParameters,
  formatUnits,
  type Address,
  type Hash,
} from "viem";
import { guardlinkAbi } from "@guardlink/domain/abi";
import {
  microUsdc,
  type Claim,
  type Ballot,
  type ClaimStatus,
} from "@guardlink/domain";
export const arcClient = (rpc: string) =>
  createPublicClient({ transport: http(rpc) });
export const canonicalClaimId = (wallet: Address, id: string) =>
  keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }],
      [wallet, keccak256(toBytes(id))],
    ),
  );
export async function syncFromArc(
  env: Cloudflare.Env,
  claim: Claim,
  txHash: Hash,
  rationale?: { jurorId: string; reason: string; appealRound: boolean },
) {
  if (!env.ARC_POOL_ADDRESS) throw new Error("Settlement is not connected.");
  const pool = env.ARC_POOL_ADDRESS as Address,
    client = arcClient(env.ARC_RPC);
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (
    receipt.status !== "success" ||
    receipt.to?.toLowerCase() !== pool.toLowerCase()
  )
    throw new Error("No successful community transaction was found.");
  const member = await env.DB.prepare("SELECT wallet FROM members WHERE id=?")
    .bind(claim.memberId)
    .first<{ wallet: Address }>();
  if (!member) throw new Error("Member not found.");
  const id = canonicalClaimId(member.wallet, claim.id);
  const raw = await client.readContract({
    address: pool,
    abi: guardlinkAbi,
    functionName: "getClaim",
    args: [id],
  });
  if (
    raw.claimant.toLowerCase() !== member.wallet.toLowerCase() ||
    raw.policyId.toString() !== claim.policyId ||
    raw.requestedAmount !== microUsdc(claim.requestedAmount)
  )
    throw new Error("The chain record does not match this case.");
  if (
    !receipt.logs.some(
      (l) =>
        l.address.toLowerCase() === pool.toLowerCase() &&
        l.topics.some((t) => t === id),
    )
  )
    throw new Error("This receipt does not refer to the case.");
  if (
    raw.paid &&
    !claim.transactionHash &&
    !receipt.logs.some(
      (l) =>
        l.topics[0] ===
          keccak256(toBytes("ClaimPaid(bytes32,address,uint128)")) &&
        l.topics[1] === id,
    )
  )
    throw new Error("Use the payout receipt to confirm this payment.");
  const roster = await env.DB.prepare(
    "SELECT id,wallet FROM members WHERE community_id=?",
  )
    .bind(claim.communityId)
    .all<{ id: string; wallet: string }>();
  const memberId = (wallet: string) =>
    roster.results.find((m) => m.wallet?.toLowerCase() === wallet.toLowerCase())
      ?.id ?? wallet.toLowerCase();
  const jurors = await client.readContract({
    address: pool,
    abi: guardlinkAbi,
    functionName: "getJury",
    args: [id, false],
  });
  const appeals = await client.readContract({
    address: pool,
    abi: guardlinkAbi,
    functionName: "getJury",
    args: [id, true],
  });
  let rationaleMatched = !rationale;
  const loadVotes = async (appeal: boolean, panel: readonly string[]) => {
    const votes: Ballot[] = [];
    for (let i = 0; i < 3; i++) {
      const b = await client.readContract({
        address: pool,
        abi: guardlinkAbi,
        functionName: "getBallot",
        args: [id, appeal, BigInt(i)],
      });
      if (b.cast) {
        const jurorId = memberId(panel[i]);
        const previous = (appeal ? claim.appealVotes : claim.votes).find(
          (v) => v.jurorId === jurorId,
        );
        let reason =
          previous && keccak256(toBytes(previous.reason)) === b.rationaleHash
            ? previous.reason
            : `Recorded rationale ${b.rationaleHash}`;
        if (
          rationale &&
          rationale.jurorId === jurorId &&
          rationale.appealRound === appeal &&
          keccak256(toBytes(rationale.reason)) === b.rationaleHash
        ) {
          reason = rationale.reason;
          rationaleMatched = true;
        }
        votes.push({
          jurorId,
          approve: b.approve,
          amount: formatUnits(b.amount, 6),
          reason,
        });
      }
    }
    return votes;
  };
  const statuses: Record<number, ClaimStatus> = {
    1: "awaiting_jury",
    2: "under_review",
    3: "approved",
    4: "rejected",
    5: "unresolved",
    6: "appealed",
    7: "appealed",
    8: "paid",
  };
  let status = statuses[raw.status];
  if (!status) throw new Error("Unknown chain status.");
  if (raw.status === 3) {
    const available = await client.getBalance({ address: pool });
    if (available / 1_000_000_000_000n < raw.approvedAmount)
      status = "awaiting_funds";
  }
  const votes = await loadVotes(false, jurors),
    appealVotes = await loadVotes(true, appeals);
  if (!rationaleMatched)
    throw new Error("The reason does not match your recorded jury vote.");
  return {
    ...claim,
    chainClaimId: id,
    contactId:
      raw.contact === "0x0000000000000000000000000000000000000000"
        ? undefined
        : memberId(raw.contact),
    status,
    approvedAmount: raw.approvedAmount
      ? formatUnits(raw.approvedAmount, 6)
      : undefined,
    appealed: raw.appealed,
    jurors: jurors
      .filter((a) => a !== "0x0000000000000000000000000000000000000000")
      .map(memberId),
    appealJurors: appeals
      .filter((a) => a !== "0x0000000000000000000000000000000000000000")
      .map(memberId),
    votes,
    appealVotes,
    transactionHash: raw.paid ? (claim.transactionHash ?? txHash) : undefined,
  };
}
