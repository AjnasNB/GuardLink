import { Hono } from "hono";
import { decodeEventLog, formatUnits } from "viem";
import { z } from "zod";
import { guardlinkAbi } from "@guardlink/domain/abi";
import { arcClient } from "../adapters/arc";
import type { Role } from "@guardlink/domain";
type Member = {
  id: string;
  wallet: string | null;
  name: string;
  role: Role;
  community_id: string;
  verified: number;
  demo: number;
};
export const governance = new Hono<{
  Bindings: Cloudflare.Env;
  Variables: { member: Member };
}>({ strict: false });
governance.get("/", async (c) => {
  if (!c.env.ARC_POOL_ADDRESS) return c.json([]);
  const client = arcClient(c.env.ARC_RPC),
    address = c.env.ARC_POOL_ADDRESS as `0x${string}`;
  const next = await client.readContract({
    address,
    abi: guardlinkAbi,
    functionName: "nextProposalId",
  });
  const stored = await c.env.DB.prepare(
    "SELECT id,description FROM governance_proposals",
  ).all<{ id: string; description: string }>();
  const count = Number(next > 101n ? 100n : next - 1n),
    wallet = c.get("member").wallet as `0x${string}` | null;
  const proposals = await Promise.all(
    Array.from({ length: count }, (_, i) => next - 1n - BigInt(i)).map(
      async (id) => {
        const p = await client.readContract({
          address,
          abi: guardlinkAbi,
          functionName: "getProposal",
          args: [id],
        });
        const cast = p.yesVotes + p.noVotes,
          passed =
            cast > 0n &&
            cast >= (p.eligibleCount + 1n) / 2n &&
            p.yesVotes >= (cast * 2n + 2n) / 3n;
        const hasVoted = wallet
          ? await client.readContract({
              address,
              abi: guardlinkAbi,
              functionName: "proposalVoted",
              args: [id, wallet],
            })
          : false;
        return {
          id: id.toString(),
          description:
            stored.results.find((row) => row.id === id.toString())
              ?.description ?? `Community proposal #${id}`,
          status: p.executed
            ? "Executed"
            : Number(p.deadline) * 1000 > Date.now()
              ? "Voting open"
              : passed
                ? "Ready to execute"
                : "Not passed",
          yesVotes: p.yesVotes.toString(),
          noVotes: p.noVotes.toString(),
          eligible: p.eligibleCount.toString(),
          deadline: Number(p.deadline),
          hasVoted,
          canExecute:
            !p.executed &&
            passed &&
            (Number(p.deadline) * 1000 <= Date.now() ||
              cast === p.eligibleCount),
          kind: p.kind,
        };
      },
    ),
  );
  return c.json(proposals);
});
governance.post("/sync", async (c) => {
  const { txHash } = z
    .object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) })
    .parse(await c.req.json());
  if (!c.env.ARC_POOL_ADDRESS)
    return c.json({ error: "Community settlement is unavailable." }, 503);
  const receipt = await arcClient(c.env.ARC_RPC).getTransactionReceipt({
    hash: txHash as `0x${string}`,
  });
  if (
    receipt.status !== "success" ||
    receipt.to?.toLowerCase() !== c.env.ARC_POOL_ADDRESS.toLowerCase()
  )
    return c.json(
      { error: "No successful community proposal receipt was found." },
      400,
    );
  let saved = 0;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== c.env.ARC_POOL_ADDRESS.toLowerCase())
      continue;
    let decoded;
    try {
      decoded = decodeEventLog({
        abi: guardlinkAbi,
        data: log.data,
        topics: log.topics,
      });
    } catch {
      continue;
    }
    if (
      decoded.eventName === "ProposalExecuted" ||
      decoded.eventName === "RulesUpdated"
    ) {
      const id = decoded.args.proposalId;
      let kind: string, data: Record<string, unknown>;
      if (decoded.eventName === "RulesUpdated") {
        kind = "community_terms";
        data = {
          status: "current_at_execution",
          poolAddress: c.env.ARC_POOL_ADDRESS,
          contribution: formatUnits(decoded.args.contribution, 6),
          coverageLimit: formatUnits(decoded.args.limit, 6),
          termDays: Number(decoded.args.termDays),
          proposalId: id.toString(),
          transactionHash: txHash,
        };
      } else {
        const proposal = await arcClient(c.env.ARC_RPC).readContract({
          address: c.env.ARC_POOL_ADDRESS as `0x${string}`,
          abi: guardlinkAbi,
          functionName: "getProposal",
          args: [id],
        });
        if (!proposal.executed) continue;
        kind = "governance_executed";
        data = {
          status: "executed",
          proposalId: id.toString(),
          yesVotes: proposal.yesVotes.toString(),
          noVotes: proposal.noVotes.toString(),
          eligible: proposal.eligibleCount.toString(),
          transactionHash: txHash,
        };
      }
      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO events(id,claim_id,kind,public_data,created_at) VALUES(?,NULL,?,?,?)",
      )
        .bind(
          `${txHash}:${log.logIndex}`,
          kind,
          JSON.stringify(data),
          new Date().toISOString(),
        )
        .run();
      saved++;
      continue;
    }
    if (decoded.eventName !== "ProposalCreated") continue;
    const args = decoded.args;
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO governance_proposals VALUES(?,?,?,?)",
    )
      .bind(
        args.proposalId.toString(),
        args.description,
        txHash,
        Number(receipt.blockNumber),
      )
      .run();
    saved++;
  }
  if (!saved)
    return c.json(
      { error: "This receipt does not contain a proposal creation." },
      400,
    );
  return c.json({ indexed: saved });
});
