import { Hono } from "hono";
import { z } from "zod";
import { uploadCiphertext, downloadCiphertext } from "../adapters/swarm";
import { event, hash, loadClaim, saveClaim } from "../lib";
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
export const swarm = new Hono<{
  Bindings: Cloudflare.Env;
  Variables: { member: Member };
}>({ strict: false });
swarm.post("/archive", async (c) => {
  const { claimId } = z
    .object({ claimId: z.string().uuid() })
    .parse(await c.req.json());
  const member = c.get("member"),
    claim = await loadClaim(c.env.DB, claimId);
  if (claim.memberId !== member.id)
    return c.json(
      { error: "Only the claimant can archive this evidence." },
      403,
    );
  if (!c.env.SWARM_BEE_URL || !c.env.SWARM_BATCH_ID)
    return c.json(
      { error: "Encrypted evidence archival is not connected." },
      503,
    );
  const rows = await c.env.DB.prepare(
    "SELECT id,ciphertext FROM evidence WHERE claim_id=? AND swarm_reference IS NULL LIMIT 3",
  )
    .bind(claimId)
    .all<{ id: string; ciphertext: number[] }>();
  const documents = [...claim.documents];
  let archived = 0;
  for (const row of rows.results) {
    const ciphertext = new Uint8Array(row.ciphertext).buffer;
    const reference = await uploadCiphertext(
      c.env.SWARM_BEE_URL,
      c.env.SWARM_BATCH_ID,
      ciphertext,
    );
    if (!reference)
      throw new Error("Evidence archival did not return a reference.");
    const retrieved = await downloadCiphertext(c.env.SWARM_BEE_URL, reference);
    if ((await hash(ciphertext)) !== (await hash(retrieved)))
      throw new Error("Archived ciphertext did not match the original.");
    await c.env.DB.prepare("UPDATE evidence SET swarm_reference=? WHERE id=?")
      .bind(reference, row.id)
      .run();
    const index = documents.findIndex((d) => d.id === row.id);
    if (index >= 0)
      documents[index] = { ...documents[index], swarmReference: reference };
    await event(c.env.DB, claimId, "evidence_archived", {
      claimId,
      status: claim.status,
      evidenceRef: reference,
    });
    archived++;
  }
  const archivedRows = await c.env.DB.prepare(
    "SELECT id,swarm_reference FROM evidence WHERE claim_id=? AND swarm_reference IS NOT NULL",
  )
    .bind(claimId)
    .all<{ id: string; swarm_reference: string }>();
  const recovered = documents.map((doc) => ({
    ...doc,
    swarmReference:
      archivedRows.results.find((row) => row.id === doc.id)?.swarm_reference ??
      doc.swarmReference,
  }));
  await saveClaim(
    c.env.DB,
    { ...claim, documents: recovered },
    claim.storageRevision,
  );
  return c.json({ archived, encrypted: true, roundTripVerified: true });
});
