import { Hono } from "hono";
import { z } from "zod";
import { guardlinkAbi } from "@guardlink/domain/abi";
import { arcClient } from "../adapters/arc";

type CommunityMember = {
  id: string;
  wallet: string | null;
  community_id: string;
  verified: number;
};
type Profile = {
  id: string;
  name: string;
  location: string;
  description: string;
  joiningCriteria: string;
};

export function communityProfile(db: D1Database, id: string) {
  return db.prepare(
    "SELECT id,name,location,description,joining_criteria AS joiningCriteria FROM communities WHERE id=?",
  ).bind(id).first<Profile>();
}

export async function isCommunityOperator(env: Cloudflare.Env, wallet: string | null) {
  if (!wallet || !env.ARC_POOL_ADDRESS) return false;
  const admin = await arcClient(env.ARC_RPC).readContract({
    address: env.ARC_POOL_ADDRESS as `0x${string}`,
    abi: guardlinkAbi,
    functionName: "admin",
  });
  return admin.toLowerCase() === wallet.toLowerCase();
}

export const community = new Hono<{
  Bindings: Cloudflare.Env;
  Variables: { member: CommunityMember };
}>({ strict: false });

community.get("/", async (c) => {
  const member = c.get("member");
  const [profile, request, canEdit] = await Promise.all([
    communityProfile(c.env.DB, member.community_id),
    c.env.DB.prepare("SELECT status FROM membership_requests WHERE member_id=? AND community_id=?")
      .bind(member.id, member.community_id).first<{ status: string }>(),
    isCommunityOperator(c.env, member.wallet).catch(() => false),
  ]);
  if (!profile) return c.json({ error: "Community not found." }, 404);
  return c.json({
    ...profile,
    canEdit,
    membership: member.verified ? "verified" : request ? "requested" : "eligible_to_apply",
  });
});

community.post("/join", async (c) => {
  const member = c.get("member");
  if (member.verified) return c.json({ status: "verified" });
  const pool = c.env.ARC_POOL_ADDRESS;
  if (!pool || !member.wallet) {
    return c.json({ error: "Connect your wallet on Arc Testnet to request membership." }, 409);
  }
  const existing = await c.env.DB.prepare(
    "SELECT status FROM membership_requests WHERE member_id=? AND community_id=?",
  ).bind(member.id, member.community_id).first<{ status: string }>();
  if (existing) return c.json({ status: "requested" });

  const { acceptedCriteria } = z.object({ acceptedCriteria: z.string().min(1).max(1000) })
    .parse(await c.req.json());
  const profile = await communityProfile(c.env.DB, member.community_id);
  if (!profile) return c.json({ error: "Community not found." }, 404);
  if (acceptedCriteria !== profile.joiningCriteria) {
    return c.json({ error: "The joining criteria changed. Review the latest criteria and try again." }, 409);
  }
  const joined = await arcClient(c.env.ARC_RPC).readContract({
    address: pool as `0x${string}`,
    abi: guardlinkAbi,
    functionName: "members",
    args: [member.wallet as `0x${string}`],
  });
  if (!joined) return c.json({ error: "Confirm your wallet registration on Arc before requesting verification." }, 409);
  const inserted = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO membership_requests(member_id,community_id,created_at,accepted_criteria)
     SELECT ?,id,?,joining_criteria FROM communities WHERE id=? AND joining_criteria=?`,
  ).bind(member.id, new Date().toISOString(), member.community_id, acceptedCriteria).run();
  if (!inserted.meta.changes) {
    const request = await c.env.DB.prepare(
      "SELECT 1 FROM membership_requests WHERE member_id=? AND community_id=?",
    ).bind(member.id, member.community_id).first();
    if (!request) return c.json({ error: "The joining criteria changed. Review the latest criteria and try again." }, 409);
  }
  return c.json({ status: "requested" });
});
