import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const readProof = (name) => JSON.parse(readFileSync(new URL(`../docs/ethglobal/${name}`, import.meta.url), "utf8"));
const arkiv = readProof("arkiv-verification.json");
const swarm = readProof("swarm-verification.json");
const app = "https://guardlink.ajnasnb.com";
const timelineUrl = new URL("/api/v1/transparency/", app);
timelineUrl.searchParams.set("caseId", swarm.claimId);
const evidenceUrl = new URL(`/api/v1/evidence/${swarm.evidenceId}/`, app);

const [timelineResponse, ciphertextResponse, privateResponse] = await Promise.all(
  [timelineUrl, swarm.ciphertextGateway, evidenceUrl].map((url) =>
    fetch(url, { signal: AbortSignal.timeout(20_000) }),
  ),
);
assert.equal(timelineResponse.status, 200, "Arkiv case timeline should be available");
assert.equal(ciphertextResponse.status, 200, "Swarm should serve the recorded ciphertext");
assert.equal(privateResponse.status, 401, "Anonymous evidence access should be denied");

const rows = await timelineResponse.json();
assert.ok(Array.isArray(rows) && rows.length > 0, "Expected a populated case timeline");
const privateFields = ["documents", "memberId", "description", "evidenceKey", "recommendation"];
for (const row of rows) {
  assert.equal(row.owner?.toLowerCase(), arkiv.writer.toLowerCase());
  assert.match(row.arkiv_key, /^0x[0-9a-f]{64}$/i);
  const data = JSON.parse(row.public_data);
  assert.equal(data.claimId, swarm.claimId, "Query returned an unrelated case");
  for (const field of privateFields) {
    assert.ok(!(field in data), `Unexpected private field: ${field}`);
  }
}
const payout = rows.find((row) => row.arkiv_key === arkiv.sample.arkiv_key);
assert.equal(payout?.kind, "paid");
const payoutHash = JSON.parse(payout.public_data).transactionHash;
assert.equal(payoutHash, JSON.parse(arkiv.sample.public_data).transactionHash);
const archive = rows.find((row) => row.arkiv_key === swarm.arkivEntityKey);
assert.equal(archive?.swarmReference, swarm.swarmReference, "Arkiv must point to the recorded Swarm reference");
assert.match(archive.swarmReference, /^[0-9a-f]{64}$/i, "Expected a 32-byte ciphertext address");

const ciphertext = Buffer.from(await ciphertextResponse.arrayBuffer());
assert.ok(ciphertext.length > 16 && ciphertext.subarray(0, 5).toString() !== "%PDF-", "Expected encrypted evidence bytes");
const ciphertextSha256 = createHash("sha256").update(ciphertext).digest("hex");
assert.equal(ciphertextSha256, swarm.ciphertextSha256, "Swarm bytes differ from the recorded archive digest");
console.log(JSON.stringify({
  caseId: swarm.claimId,
  rows: rows.length,
  writer: arkiv.writer,
  payoutHash,
  arkivEntityKey: archive.arkiv_key,
  swarmReference: archive.swarmReference,
  ciphertextSha256,
  anonymousEvidenceStatus: privateResponse.status,
}, null, 2));
