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

for (const row of rows) {
  const { claimId, status, transactionHash, ...details } = JSON.parse(row.public_data);
  const payload = { id: row.id, kind: row.kind, claimId, status, transactionHash, createdAt: row.created_at };
  // Early Arkiv records were written before the details field was introduced.
  const versions = Object.keys(details).length ? [{ ...payload, details }] : [payload, { ...payload, details }];
  const digests = versions.map((version) => `0x${createHash("sha256").update(JSON.stringify(version)).digest("hex")}`);
  assert.ok(digests.includes(row.payloadHash), "Expected the digest of the public Arkiv payload");
}

async function read(path) {
  const response = await fetch(new URL(`/api/v1${path}`, app), { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200, path);
  return response.json();
}
const [proposalList, proposalVotes, executions, juryVotes, approvals] = await Promise.all([
  read("/governance/public/"), read("/ledger/?kind=proposal-votes"), read("/ledger/?kind=executions"),
  read("/ledger/?kind=jury-votes"), read("/ledger/?kind=approvals"),
]);
const proposal = proposalList.find(({ id }) => id === "1");
assert.equal(proposal.status, "Executed");
const ballots = proposalVotes.entries.filter(({ proposalId }) => proposalId === proposal.id);
assert.equal(ballots.filter(({ decision }) => decision === "Support").length, Number(proposal.yesVotes));
assert.equal(ballots.filter(({ decision }) => decision === "Against").length, Number(proposal.noVotes));
assert.ok(executions.entries.some(({ proposalId, hash }) => proposalId === proposal.id && /^0x[\da-f]{64}$/i.test(hash)));
const caseBallots = juryVotes.entries.filter(({ claimId }) => claimId === archive.chainClaimId);
assert.equal(caseBallots.length, 2);
for (const ballot of caseBallots) {
  assert.equal(ballot.decision, "Approve");
  assert.match(ballot.rationaleHash, /^0x[\da-f]{64}$/i);
  assert.ok(!("reason" in ballot));
}
assert.ok(approvals.entries.some(({ claimId, decision }) => claimId === archive.chainClaimId && decision === "Approved"));

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
  proposalBallotsVerified: ballots.length,
  caseBallotsVerified: caseBallots.length,
}, null, 2));
