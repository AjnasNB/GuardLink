import {
  createPublicClient,
  createWalletClient,
  ExpirationTime,
} from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { str, bytes, defineSchema } from "@arkiv-network/sdk/schema";
import { and, eq } from "@arkiv-network/sdk/query";
import { http, stringToBytes, hexToString, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
const Records = defineSchema("guardlink_records_v1", {
  project: str().indexed(),
  recordId: str().indexed(),
  kind: str().indexed(),
  community: str().indexed(),
  caseId: str().indexed(),
  status: str().indexed(),
  body: bytes(),
  swarmReference: str().optional(),
});
function clients(env: Cloudflare.Env) {
  if (!env.ARKIV_RPC || !env.ARKIV_PRIVATE_KEY)
    throw new Error("Queryable public records are not connected yet.");
  const account = privateKeyToAccount(env.ARKIV_PRIVATE_KEY as Hex);
  const chain = rabdi({ accessKey: "" });
  const transport = http(env.ARKIV_RPC, {
    fetchOptions: {
      headers: env.ARKIV_ACCESS_KEY
        ? { "X-API-KEY": env.ARKIV_ACCESS_KEY }
        : {},
    },
  });
  return {
    account,
    reader: createPublicClient({ chain, transport }),
    writer: createWalletClient({ chain, transport, account }),
  };
}
export async function publishPending(env: Cloudflare.Env) {
  const { reader, writer, account } = clients(env);
  if ((await reader.getChainId()) !== 7794095)
    throw new Error("Public records must use the configured test network.");
  const events = await env.DB.prepare(
    "SELECT * FROM events WHERE arkiv_key IS NULL ORDER BY CASE kind WHEN 'evidence_archived' THEN 0 WHEN 'community_terms' THEN 1 WHEN 'governance_executed' THEN 1 WHEN 'paid' THEN 2 ELSE 3 END,created_at DESC LIMIT 3",
  ).all<{
    id: string;
    claim_id: string | null;
    kind: string;
    public_data: string;
    created_at: string;
  }>();
  let count = 0;
  for (const event of events.results) {
    const already = await env.DB.prepare(
      "SELECT arkiv_key FROM events WHERE kind=? AND public_data=? AND arkiv_key IS NOT NULL LIMIT 1",
    )
      .bind(event.kind, event.public_data)
      .first<{ arkiv_key: string }>();
    if (already) {
      await env.DB.prepare("UPDATE events SET arkiv_key=? WHERE id=?")
        .bind(already.arkiv_key, event.id)
        .run();
      continue;
    }
    const existing = await reader
      .select({ $key: true })
      .from(Records)
      .where(and(eq("project", "guardlink"), eq("recordId", event.id)))
      .ownedBy(account.address)
      .limit(1)
      .fetch();
    let key = existing.entities[0]?.$key;
    if (!key) {
      const data = JSON.parse(event.public_data) as Record<string, unknown>;
      const detailFields = [
        "poolAddress",
        "contribution",
        "coverageLimit",
        "termDays",
        "proposalId",
        "yesVotes",
        "noVotes",
        "eligible",
      ];
      const details = Object.fromEntries(
        detailFields
          .filter(
            (key) =>
              typeof data[key] === "string" || typeof data[key] === "number",
          )
          .map((key) => [key, data[key]]),
      );
      const body = {
        id: event.id,
        kind: event.kind,
        claimId: event.claim_id,
        status: data.status ?? event.kind,
        transactionHash: data.transactionHash ?? null,
        createdAt: event.created_at,
        details,
      };
      const created = await writer.createEntity(
        Records,
        {
          project: "guardlink",
          recordId: event.id,
          kind: event.kind,
          community: "kerala-demo",
          caseId: event.claim_id ?? "",
          status: String(data.status ?? event.kind),
          body: stringToBytes(JSON.stringify(body)),
          ...(typeof data.evidenceRef === "string"
            ? { swarmReference: data.evidenceRef }
            : {}),
        },
        { expiration: ExpirationTime.fromDays(30) },
      );
      key = created.entityKey;
    }
    await env.DB.prepare("UPDATE events SET arkiv_key=? WHERE id=?")
      .bind(key, event.id)
      .run();
    count++;
  }
  return { published: count };
}
export async function queryPublicRecords(env: Cloudflare.Env, caseId?: string) {
  const { reader, account } = clients(env);
  const filter = caseId
    ? and(eq("project", "guardlink"), eq("caseId", caseId))
    : eq("project", "guardlink");
  const result = await reader
    .select({ $key: true, $owner: true, body: true, swarmReference: true })
    .from(Records)
    .where(filter)
    .ownedBy(account.address)
    .limit(100)
    .fetch();
  return result.entities.map((row) => {
    const body = JSON.parse(hexToString(row.body.value)) as {
      id: string;
      kind: string;
      claimId: string | null;
      status: string;
      transactionHash: string | null;
      createdAt: string;
      details?: Record<string, string | number>;
    };
    return {
      id: body.id,
      kind: body.kind,
      public_data: JSON.stringify({
        claimId: body.claimId,
        status: body.status,
        transactionHash: body.transactionHash,
        ...body.details,
      }),
      created_at: body.createdAt,
      arkiv_key: row.$key,
      owner: row.$owner,
      swarmReference: row.swarmReference?.value ?? null,
    };
  });
}
