import { Hono } from "hono";
import { organizer } from "./routes/organizer";
import { community } from "./routes/community";
import { governance, listProposals } from "./routes/governance";
import { swarm } from "./routes/swarm";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  createPublicClient,
  http,
  isAddress,
  recoverMessageAddress,
  parseAbi,
  formatUnits,
  parseAbiItem,
} from "viem";
import { guardlinkAbi } from "@guardlink/domain/abi";
import { arcClient, syncFromArc } from "./adapters/arc";
import { publishPending, queryPublicRecords } from "./adapters/arkiv";
import { ledgerQuery, loadLedger } from "./adapters/ledger";
import { jwtVerify, importSPKI } from "jose";
import { z } from "zod";
import {
  addEvidence,
  microUsdc,
  publicClaim,
  type Claim,
  type Role,
} from "@guardlink/domain";
import {
  base64,
  decrypt,
  encrypt,
  event,
  hash,
  json,
  loadClaim,
  now,
  saveClaim,
} from "./lib";
import { downloadCiphertext, uploadCiphertext } from "./adapters/swarm";
export { ClaimAnalysisWorkflow } from "./workflow";
type Member = {
  id: string;
  wallet: string | null;
  name: string;
  role: Role;
  community_id: string;
  community_name: string | null;
  verified: number;
  demo: number;
};
const app = new Hono<{
  Bindings: Cloudflare.Env;
  Variables: { member: Member };
}>({ strict: false });
app.use(
  "*",
  bodyLimit({
    maxSize: 5 * 1024 * 1024,
    onError: (c) =>
      c.json({ error: "Upload a document smaller than 1 MB." }, 413),
  }),
);
app.onError((error, c) => {
  const message =
    error instanceof z.ZodError ? "Check the submitted fields." : error.message;
  return c.json({ error: message }, 400);
});
app.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (origin && !c.env.WEB_ORIGIN.split(",").includes(origin))
      return c.json({ error: "Request origin is not allowed." }, 403);
  }
  await next();
});
app.get("/health", (c) => c.json({ ok: true, environment: c.env.ENVIRONMENT }));
app.use("/api/v1/auth/*", async (c, next) => {
  if (c.req.method !== "POST") return next();
  const ip = c.req.header("CF-Connecting-IP");
  if (!ip) return next();
  const windowMs = 60000,
    bucket = `${await hash(ip)}:${Math.floor(Date.now() / windowMs)}`;
  const row = await c.env.DB.prepare(
    "INSERT INTO auth_rate_limits(bucket,requests,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET requests=requests+1 RETURNING requests",
  )
    .bind(bucket, Date.now() + windowMs)
    .first<{ requests: number }>();
  if ((row?.requests ?? 0) > 30) {
    c.header("Retry-After", "60");
    return c.json(
      { error: "Too many sign-in attempts. Please wait a minute." },
      429,
    );
  }
  c.executionCtx.waitUntil(
    c.env.DB.prepare("DELETE FROM auth_rate_limits WHERE expires_at<?")
      .bind(Date.now())
      .run(),
  );
  await next();
});
app.get("/api/v1/terms", async (c) => {
  if (!c.env.ARC_POOL_ADDRESS)
    return c.json({ error: "Community terms are unavailable." }, 503);
  const client = arcClient(c.env.ARC_RPC),
    address = c.env.ARC_POOL_ADDRESS as `0x${string}`;
  const [contribution, limit, days] = await Promise.all([
    client.readContract({
      address,
      abi: guardlinkAbi,
      functionName: "contributionAmount",
    }),
    client.readContract({
      address,
      abi: guardlinkAbi,
      functionName: "coverageLimit",
    }),
    client.readContract({
      address,
      abi: guardlinkAbi,
      functionName: "termDays",
    }),
  ]);
  return c.json({
    contribution: formatUnits(contribution, 6),
    coverageLimit: formatUnits(limit, 6),
    termDays: Number(days),
    poolAddress: address,
  });
});
app.get("/api/v1/config", (c) =>
  c.json({
    testnet: true,
    chainId: 5042002,
    poolAddress: c.env.ARC_POOL_ADDRESS,
    privyAppId: c.env.PRIVY_APP_ID,
    features: {
      azure: !!c.env.AZURE_ENDPOINT && !!c.env.AZURE_API_KEY,
      swarm: !!c.env.SWARM_BEE_URL && !!c.env.SWARM_BATCH_ID,
      arkiv: !!c.env.ARKIV_RPC,
      settlement: !!c.env.ARC_POOL_ADDRESS,
    },
  }),
);
app.post("/api/v1/auth/challenge", async (c) => {
  const { wallet } = z
    .object({ wallet: z.string().refine(isAddress) })
    .parse(await c.req.json());
  const id = crypto.randomUUID();
  const expires = Date.now() + 300000;
  const origins = c.env.WEB_ORIGIN.split(",");
  const requestOrigin = c.req.header("Origin");
  const origin =
    requestOrigin && origins.includes(requestOrigin)
      ? requestOrigin
      : (origins.find((o) => o.startsWith("https:")) ?? origins[0]);
  const message = `${new URL(origin).host} wants you to sign in with your Ethereum account:\n${wallet}\n\nSign in to GuardLink. This does not authorize a payment.\n\nURI: ${origin}\nVersion: 1\nChain ID: 5042002\nNonce: ${id.replaceAll("-", "")}\nIssued At: ${new Date().toISOString()}\nExpiration Time: ${new Date(expires).toISOString()}`;
  await c.env.DB.prepare("INSERT INTO auth_challenges VALUES(?,?,?,?,0)")
    .bind(id, wallet.toLowerCase(), message, expires)
    .run();
  return c.json({ id, message });
});
async function memberForWallet(db: D1Database, wallet: string) {
  let m = await db
    .prepare("SELECT * FROM members WHERE wallet=?")
    .bind(wallet.toLowerCase())
    .first<Member>();
  if (!m) {
    const id = crypto.randomUUID();
    await db
      .prepare("INSERT INTO members(id,wallet,name,created_at) VALUES(?,?,?,?)")
      .bind(id, wallet.toLowerCase(), "New member", now())
      .run();
    m = await db
      .prepare("SELECT * FROM members WHERE id=?")
      .bind(id)
      .first<Member>();
  }
  return m!;
}
async function session(
  c: Parameters<typeof getCookie>[0],
  db: D1Database,
  memberId: string,
) {
  const token = base64(crypto.getRandomValues(new Uint8Array(32)));
  await db
    .prepare("INSERT INTO sessions VALUES(?,?,?)")
    .bind(await hash(token), memberId, Date.now() + 86400000)
    .run();
  setCookie(c, "guardlink_session", token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: 86400,
  });
}
app.post("/api/v1/auth/verify", async (c) => {
  const { id, signature } = z
    .object({
      id: z.string().uuid(),
      signature: z.string().regex(/^0x[0-9a-f]+$/i),
    })
    .parse(await c.req.json());
  const row = await c.env.DB.prepare("SELECT * FROM auth_challenges WHERE id=?")
    .bind(id)
    .first<{
      wallet: string;
      message: string;
      expires_at: number;
      used: number;
    }>();
  if (!row || row.used || row.expires_at < Date.now())
    return c.json({ error: "This sign-in request expired. Try again." }, 401);
  const recovered = await recoverMessageAddress({
    message: row.message,
    signature: signature as `0x${string}`,
  });
  if (recovered.toLowerCase() !== row.wallet)
    return c.json({ error: "Wallet signature does not match." }, 401);
  const consumed = await c.env.DB.prepare(
    "UPDATE auth_challenges SET used=1 WHERE id=? AND used=0",
  )
    .bind(id)
    .run();
  if (consumed.meta.changes !== 1)
    return c.json({ error: "Sign-in request already used." }, 401);
  const member = await memberForWallet(c.env.DB, row.wallet);
  await session(c, c.env.DB, member.id);
  return c.json({ member });
});
app.post("/api/v1/auth/privy", async (c) => {
  if (!c.env.PRIVY_APP_ID || !c.env.PRIVY_VERIFICATION_KEY)
    return c.json(
      {
        error:
          "Email sign-in is not configured yet. Wallet sign-in is available.",
      },
      503,
    );
  const { token } = z.object({ token: z.string() }).parse(await c.req.json());
  const verified = await jwtVerify(
    token,
    await importSPKI(c.env.PRIVY_VERIFICATION_KEY, "ES256"),
    { issuer: "privy.io", audience: c.env.PRIVY_APP_ID },
  );
  if (!verified.payload.sub) throw new Error("Invalid identity.");
  let member = await c.env.DB.prepare(
    "SELECT * FROM members WHERE auth_subject=?",
  )
    .bind(verified.payload.sub)
    .first<Member>();
  if (!member) {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      "INSERT INTO members(id,auth_subject,name,created_at) VALUES(?,?,?,?)",
    )
      .bind(id, verified.payload.sub, "New member", now())
      .run();
    member = await c.env.DB.prepare("SELECT * FROM members WHERE id=?")
      .bind(id)
      .first<Member>();
  }
  await session(c, c.env.DB, member!.id);
  return c.json({ member });
});
app.post("/api/v1/auth/logout", async (c) => {
  const token = getCookie(c, "guardlink_session");
  if (token)
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await hash(token))
      .run();
  deleteCookie(c, "guardlink_session", { path: "/" });
  return c.json({ ok: true });
});
app.get("/api/v1/auth/consume", async (c) => {
  const ticket = c.req.query("ticket");
  if (!ticket || ticket.length > 100)
    return c.json({ error: "Invalid demo sign-in link." }, 401);
  const entry = await c.env.DB.prepare(
    "DELETE FROM login_handoffs WHERE token_hash=? AND expires_at>? RETURNING member_id",
  )
    .bind(await hash(ticket), Date.now())
    .first<{ member_id: string }>();
  if (!entry)
    return c.json(
      {
        error:
          "This sign-in link expired or was used. Run the local demo helper again.",
      },
      401,
    );
  await session(c, c.env.DB, entry.member_id);
  return c.redirect("/app");
});
app.get("/api/v1/communities", async (c) =>
  c.json((await c.env.DB.prepare("SELECT * FROM communities").all()).results),
);
app.get("/api/v1/ledger", async (c) => {
  const query = ledgerQuery.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "Choose a valid ledger view or page." }, 400);
  try {
    return c.json(await loadLedger(c.env.ARC_POOL_ADDRESS, query.data));
  } catch {
    return c.json({ error: "The Arc ledger is temporarily unavailable. Try again shortly." }, 503);
  }
});
app.get("/api/v1/governance/public", async (c) => {
  try {
    return c.json(await listProposals(c.env));
  } catch {
    return c.json({ error: "Public proposals are temporarily unavailable." }, 503);
  }
});
app.get("/api/v1/transparency", async (c) => {
  if (c.env.ARKIV_RPC) {
    try {
      return c.json(await queryPublicRecords(c.env, c.req.query("caseId")));
    } catch {
      return c.json(
        { error: "Queryable public records are temporarily unavailable." },
        503,
      );
    }
  }
  return c.json(
    (
      await c.env.DB.prepare(
        "SELECT id,kind,public_data,created_at,arkiv_key FROM events ORDER BY created_at DESC LIMIT 100",
      ).all()
    ).results,
  );
});
app.get("/api/v1/claims/public", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT data FROM claims ORDER BY updated_at DESC LIMIT 100",
  ).all<{ data: string }>();
  return c.json(rows.results.map((r) => publicClaim(json<Claim>(r.data))));
});
app.use("/api/v1/*", async (c, next) => {
  const token = getCookie(c, "guardlink_session");
  const member = token
    ? await c.env.DB.prepare(
        "SELECT m.*,c.name AS community_name FROM sessions s JOIN members m ON m.id=s.member_id LEFT JOIN communities c ON c.id=m.community_id WHERE s.token_hash=? AND s.expires_at>?",
      )
        .bind(await hash(token), Date.now())
        .first<Member>()
    : null;
  if (!member) return c.json({ error: "Sign in to continue." }, 401);
  c.set("member", member);
  await next();
});
app.route("/api/v1/organizer", organizer);
app.route("/api/v1/community", community);
app.route("/api/v1/integrations/swarm", swarm);
app.get("/api/v1/me", (c) => c.json(c.get("member")));
app.post("/api/v1/auth/handoff", async (c) => {
  if (!c.get("member").demo || c.env.ENVIRONMENT !== "testnet")
    return c.json(
      { error: "The local helper is restricted to labelled demo accounts." },
      403,
    );
  const ticket = base64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  await c.env.DB.prepare("DELETE FROM login_handoffs WHERE expires_at<?")
    .bind(Date.now())
    .run();
  await c.env.DB.prepare("INSERT INTO login_handoffs VALUES(?,?,?)")
    .bind(await hash(ticket), c.get("member").id, Date.now() + 60000)
    .run();
  return c.json({ path: `/api/v1/auth/consume?ticket=${ticket}` });
});
app.post("/api/v1/integrations/arkiv/publish", async (c) => {
  if (!c.get("member").verified)
    return c.json({ error: "Verified membership required." }, 403);
  try {
    return c.json(await publishPending(c.env));
  } catch {
    return c.json(
      {
        error:
          "Public record publication is pending. Check test funds and record-service access.",
      },
      503,
    );
  }
});
app.route("/api/v1/governance", governance);
app.patch("/api/v1/me", async (c) => {
  const { name } = z
    .object({ name: z.string().trim().min(2).max(80) })
    .parse(await c.req.json());
  await c.env.DB.prepare("UPDATE members SET name=? WHERE id=?")
    .bind(name, c.get("member").id)
    .run();
  return c.json({ ...c.get("member"), name });
});
app.get("/api/v1/claims", async (c) => {
  const member = c.get("member");
  const rows = await c.env.DB.prepare(
    "SELECT data FROM claims WHERE community_id=? ORDER BY updated_at DESC",
  )
    .bind(member.community_id)
    .all<{ data: string }>();
  return c.json(
    rows.results
      .map((r) => json<Claim>(r.data))
      .filter(
        (cl) =>
          cl.memberId === member.id ||
          cl.contactId === member.id ||
          cl.jurors.includes(member.id) ||
          cl.appealJurors.includes(member.id),
      ),
  );
});
function authorized(claim: Claim, m: Member) {
  return (
    claim.memberId === m.id ||
    claim.contactId === m.id ||
    claim.jurors.includes(m.id) ||
    claim.appealJurors.includes(m.id)
  );
}
app.get("/api/v1/claims/:id", async (c) => {
  const cl = await loadClaim(c.env.DB, c.req.param("id"));
  if (!authorized(cl, c.get("member")))
    return c.json({ error: "You do not have access to this case." }, 403);
  return c.json(cl);
});
app.post("/api/v1/claims", async (c) => {
  const input = z
    .object({
      policyId: z.string().min(1),
      title: z.string().min(4).max(120),
      description: z.string().min(10).max(3000),
      requestedAmount: z.string(),
      incidentDate: z.string().datetime({ offset: true }),
    })
    .parse(await c.req.json());
  if (microUsdc(input.requestedAmount) <= 0n)
    throw new Error("Claim amount must be positive.");
  const member = c.get("member");
  if (!member.wallet || !member.verified)
    throw new Error("Verified community membership is required.");
  if (!c.env.ARC_POOL_ADDRESS)
    throw new Error("Coverage settlement is not connected yet.");
  const client = createPublicClient({ transport: http(c.env.ARC_RPC) });
  const policy = await client.readContract({
    address: c.env.ARC_POOL_ADDRESS as `0x${string}`,
    abi: parseAbi([
      "function policies(uint256) view returns (address member,uint64 start,uint64 end,uint128 limit,uint128 used)",
    ]),
    functionName: "policies",
    args: [BigInt(input.policyId)],
  });
  const incident = Math.floor(new Date(input.incidentDate).getTime() / 1000);
  if (
    policy[0].toLowerCase() !== member.wallet ||
    incident < Number(policy[1]) ||
    incident > Number(policy[2]) ||
    microUsdc(input.requestedAmount) > policy[3] - policy[4]
  )
    throw new Error("The policy does not cover this incident or amount.");
  const claim: Claim = {
    ...input,
    id: crypto.randomUUID(),
    memberId: member.id,
    communityId: member.community_id,
    status: "submitted",
    documents: [],
    requests: [],
    jurors: [],
    votes: [],
    appealJurors: [],
    appealVotes: [],
    appealed: false,
    revision: 0,
    createdAt: now(),
  };
  await c.env.DB.prepare("INSERT INTO claims VALUES(?,?,?,?,0,?)")
    .bind(
      claim.id,
      member.id,
      member.community_id,
      JSON.stringify(claim),
      now(),
    )
    .run();
  await event(c.env.DB, claim.id, "submitted", {
    claimId: claim.id,
    status: "submitted",
  });
  return c.json(claim, 201);
});
app.post("/api/v1/claims/:id/evidence", async (c) => {
  const claim = await loadClaim(c.env.DB, c.req.param("id"));
  const member = c.get("member");
  if (claim.memberId !== member.id)
    return c.json({ error: "Only the claimant can upload documents." }, 403);
  const form = await c.req.formData();
  const file = form.get("file");
  const kind = z
    .enum(["bill", "discharge_summary", "prescription", "other"])
    .parse(form.get("kind"));
  if (!(file instanceof File) || file.size > 1024 * 1024 || file.size === 0)
    throw new Error("Choose a PDF, JPEG or PNG smaller than 1 MB.");
  const bytes = await file.arrayBuffer();
  const prefix = new Uint8Array(bytes).slice(0, 8);
  const pdf = String.fromCharCode(...prefix.slice(0, 5)) === "%PDF-";
  const png =
    prefix[0] === 137 &&
    prefix[1] === 80 &&
    prefix[2] === 78 &&
    prefix[3] === 71;
  const jpeg = prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255;
  if (!pdf && !png && !jpeg)
    throw new Error("This file is not a supported document.");
  const id = crypto.randomUUID(),
    digest = await hash(bytes);
  const encrypted = await encrypt(bytes, c.env.EVIDENCE_KEY);
  const reference = await uploadCiphertext(
    c.env.SWARM_BEE_URL,
    c.env.SWARM_BATCH_ID,
    encrypted.ciphertext,
  );
  const safeName = `${kind}-${id}.${pdf ? "pdf" : png ? "png" : "jpg"}`;
  const evidence = {
    id,
    kind,
    name: safeName,
    sha256: digest,
    swarmReference: reference ?? undefined,
    createdAt: now(),
  };
  const next = addEvidence(claim, member.id, evidence);
  await c.env.DB.prepare("INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(
      id,
      claim.id,
      member.id,
      kind,
      safeName,
      digest,
      encrypted.ciphertext,
      encrypted.iv,
      reference,
      now(),
    )
    .run();
  await saveClaim(c.env.DB, next, claim.storageRevision);
  await event(c.env.DB, claim.id, "evidence_updated", {
    claimId: claim.id,
    status: next.status,
    ...(reference ? { evidenceRef: reference } : {}),
  });
  return c.json(next);
});
app.get("/api/v1/evidence/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM evidence WHERE id=?")
    .bind(c.req.param("id"))
    .first<{
      claim_id: string;
      ciphertext: number[];
      iv: string;
      swarm_reference: string;
      name: string;
    }>();
  if (!row) throw new Error("Document not found.");
  const claim = await loadClaim(c.env.DB, row.claim_id);
  if (!authorized(claim, c.get("member")))
    return c.json({ error: "Document access denied." }, 403);
  const encrypted = row.swarm_reference
    ? await downloadCiphertext(c.env.SWARM_BEE_URL, row.swarm_reference)
    : new Uint8Array(row.ciphertext).buffer;
  const plain = await decrypt(encrypted, row.iv, c.env.EVIDENCE_KEY);
  return new Response(plain, {
    headers: {
      "Content-Type": row.name.endsWith(".pdf")
        ? "application/pdf"
        : row.name.endsWith(".png")
          ? "image/png"
          : "image/jpeg",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${row.name}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});
app.post("/api/v1/claims/:id/analyze", async (c) => {
  const claim = await loadClaim(c.env.DB, c.req.param("id"));
  if (claim.memberId !== c.get("member").id)
    return c.json({ error: "Only the claimant can request analysis." }, 403);
  if (!["submitted", "needs_documents", "analyzing"].includes(claim.status))
    throw new Error("This claim is already in review.");
  const id = `${claim.id}-${claim.revision}`;
  try {
    await c.env.CLAIM_ANALYSIS.create({
      id,
      params: { claimId: claim.id, revision: claim.revision },
    });
  } catch (error) {
    const existing = await c.env.CLAIM_ANALYSIS.get(id);
    const status = await existing.status();
    if (status.status === "errored") await existing.restart();
    else if (
      !["queued", "running", "complete", "waiting", "paused"].includes(
        status.status,
      )
    )
      throw error;
  }
  return c.json({ workflowId: id, status: "analysis_requested" }, 202);
});
app.post("/api/v1/claims/:id/sync", async (c) => {
  const claim = await loadClaim(c.env.DB, c.req.param("id"));
  if (claim.communityId !== c.get("member").community_id)
    return c.json({ error: "This case belongs to another community." }, 403);
  const { txHash, reason, appealRound } = z
    .object({
      txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      reason: z.string().min(5).max(1000).optional(),
      appealRound: z.boolean().optional(),
    })
    .parse(await c.req.json());
  const next = await syncFromArc(
    c.env,
    claim,
    txHash as `0x${string}`,
    reason
      ? {
          jurorId: c.get("member").id,
          reason,
          appealRound: appealRound ?? false,
        }
      : undefined,
  );
  await saveClaim(c.env.DB, next, claim.storageRevision);
  const milestone =
    next.status !== claim.status
      ? next.status
      : next.jurors.join() !== claim.jurors.join() ||
          next.appealJurors.join() !== claim.appealJurors.join()
        ? "jury_assigned"
        : next.votes.length !== claim.votes.length ||
            next.appealVotes.length !== claim.appealVotes.length
          ? "vote_recorded"
          : next.contactId !== claim.contactId
            ? "helper_authorized"
            : null;
  if (milestone)
    await event(c.env.DB, claim.id, milestone, {
      claimId: claim.id,
      status: next.status,
      transactionHash: next.status === "paid" ? next.transactionHash : txHash,
    });
  return c.json(publicClaim(next));
});
app.get("/api/v1/balance", async (c) => {
  const wallet = c.get("member").wallet;
  if (!wallet) return c.json({ balance: null });
  const client = createPublicClient({ transport: http(c.env.ARC_RPC) });
  return c.json({
    balance: formatUnits(
      await client.getBalance({ address: wallet as `0x${string}` }),
      18,
    ),
    chainId: 5042002,
  });
});
export default app;
