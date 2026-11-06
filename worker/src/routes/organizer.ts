import { Hono } from "hono";
import { z } from "zod";
import { isAddress } from "viem";
import { guardlinkAbi } from "@guardlink/domain/abi";
import type { Claim, Role } from "@guardlink/domain";
import { arcClient } from "../adapters/arc";
import { communityProfile, isCommunityOperator } from "./community";
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
  if (!(await isCommunityOperator(c.env, c.get("member").wallet)))
    return c.json({ error: "The community operator wallet is required." }, 403);
  await next();
});
organizer.patch("/community", async (c) => {
  const fields = z.object({
    name: z.string().trim().min(2).max(80),
    location: z.string().trim().min(2).max(100),
    description: z.string().trim().min(10).max(2000),
    joiningCriteria: z.string().trim().min(10).max(1000),
  }).parse(await c.req.json());
  const id = c.get("member").community_id;
  const profile = await c.env.DB.prepare(
    "UPDATE communities SET name=?,location=?,description=?,joining_criteria=? WHERE id=? RETURNING id,name,location,description,joining_criteria AS joiningCriteria",
  ).bind(fields.name, fields.location, fields.description, fields.joiningCriteria, id).first();
  if (!profile) return c.json({ error: "Community not found." }, 404);
  return c.json(profile);
});
organizer.get("/", async (c) => {
  const community = c.get("member").community_id;
  const members = await c.env.DB.prepare(
    "SELECT m.id,m.wallet,m.name,m.role,m.verified,r.status AS request_status,r.accepted_criteria FROM members m LEFT JOIN membership_requests r ON r.member_id=m.id AND r.community_id=m.community_id WHERE m.community_id=? AND m.wallet IS NOT NULL",
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
      contactId: cl.contactId ?? null,
      jurors: cl.jurors,
      appealJurors: cl.appealJurors,
    }));
  return c.json({
    members: members.results,
    cases,
    community: await communityProfile(c.env.DB, community),
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
