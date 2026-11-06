import { Hono } from "hono";
import { z } from "zod";
import { isAddress } from "viem";
import { guardlinkAbi } from "@guardlink/domain/abi";
import type { Claim, Role } from "@guardlink/domain";
import { arcClient } from "../adapters/arc";
type Member = {
  id: string;
  wallet: string | null;
  name: string;
  role: Role;
  community_id: string;
  verified: number;
  demo: number;
};
export const organizer = new Hono<{
  Bindings: Cloudflare.Env;
  Variables: { member: Member };
}>({ strict: false });
organizer.use("*", async (c, next) => {
  const wallet = c.get("member").wallet;
  if (!wallet || !c.env.ARC_POOL_ADDRESS)
    return c.json({ error: "The community operator wallet is required." }, 403);
  const admin = await arcClient(c.env.ARC_RPC).readContract({
    address: c.env.ARC_POOL_ADDRESS as `0x${string}`,
    abi: guardlinkAbi,
    functionName: "admin",
  });
  if (admin.toLowerCase() !== wallet.toLowerCase())
    return c.json({ error: "The community operator wallet is required." }, 403);
  await next();
});
organizer.get("/", async (c) => {
  const community = c.get("member").community_id;
  const members = await c.env.DB.prepare(
    "SELECT id,wallet,name,role,verified FROM members WHERE community_id=? AND wallet IS NOT NULL",
  )
    .bind(community)
    .all();
  const rows = await c.env.DB.prepare(
    "SELECT data FROM claims WHERE community_id=?",
  )
    .bind(community)
    .all<{ data: string }>();
  const cases = rows.results
    .map((row) => JSON.parse(row.data) as Claim)
    .filter((cl) => ["awaiting_jury", "appealed"].includes(cl.status))
    .map((cl) => ({
      id: cl.id,
      chainClaimId: cl.chainClaimId,
      status: cl.status,
      claimantId: cl.memberId,
      jurors: cl.jurors,
      appealJurors: cl.appealJurors,
    }));
  return c.json({
    members: members.results,
    cases,
    notice:
      "Operator access does not grant access to medical evidence. Eligibility and panel selection are centralized in this prototype.",
  });
});
organizer.post("/membership/sync", async (c) => {
  const { memberId } = z
    .object({ memberId: z.string().min(1).max(100) })
    .parse(await c.req.json());
  const member = await c.env.DB.prepare(
    "SELECT wallet FROM members WHERE id=? AND community_id=?",
  )
    .bind(memberId, c.get("member").community_id)
    .first<{ wallet: string }>();
  if (!member || !isAddress(member.wallet))
    return c.json({ error: "Member not found." }, 404);
  const verified = await arcClient(c.env.ARC_RPC).readContract({
    address: c.env.ARC_POOL_ADDRESS as `0x${string}`,
    abi: guardlinkAbi,
    functionName: "verifiedMembers",
    args: [member.wallet as `0x${string}`],
  });
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE members SET verified=? WHERE id=?").bind(
      verified ? 1 : 0,
      memberId,
    ),
    c.env.DB.prepare(
      "UPDATE membership_requests SET status=? WHERE member_id=?",
    ).bind(verified ? "verified" : "requested", memberId),
  ]);
  return c.json({ memberId, verified });
});
