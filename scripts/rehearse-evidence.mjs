import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import { makeEvidence } from "./make-fixtures.mjs";

export async function rehearseEvidence({
  account,
  policyId,
  imagePath,
  base = "http://127.0.0.1:8787",
  incidentDate = new Date().toISOString(),
}) {
  const url = new URL(base);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Use a local GuardLink Worker for this rehearsal.");
  }
  const imageMime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" }[extname(imagePath).toLowerCase()];
  if (!imageMime) throw new Error("Provide a synthetic PNG or JPEG as supplemental evidence.");
  const image = await readFile(imagePath);
  let cookie;
  async function request(path, body, status = 200, useSession = true) {
    const headers = new Headers();
    if (useSession && cookie) headers.set("Cookie", cookie);
    const options = { headers, signal: AbortSignal.timeout(20_000) };
    if (body !== undefined) {
      options.method = "POST";
      options.body = body instanceof FormData ? body : JSON.stringify(body);
      if (!(body instanceof FormData)) headers.set("Content-Type", "application/json");
    }
    const response = await fetch(new URL(`/api/v1${path}`, url), options);
    const result = await response.json();
    assert.equal(response.status, status, `${path}: ${result.error ?? response.status}`);
    if (response.headers.has("Set-Cookie")) cookie = response.headers.get("Set-Cookie").split(";")[0];
    return result;
  }

  const challenge = await request("/auth/challenge", { wallet: account.address });
  const signature = await account.signMessage({ message: challenge.message });
  await request("/auth/verify", { id: challenge.id, signature });
  const claim = await request("/claims", {
    policyId,
    title: "Synthetic evidence assistant rehearsal",
    description: "A fictional claim with a missing prescription and conflicting amounts.",
    requestedAmount: "0.30",
    incidentDate,
  }, 201);
  const casePath = `/claims/${claim.id}`;
  const packet = makeEvidence(claim.id, "Demo patient", incidentDate, "0.30");
  packet.discharge_summary = makeEvidence(claim.id, "Demo patient", incidentDate, "0.15").discharge_summary;

  async function upload(kind, file, displayName) {
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    if (displayName) form.set("displayName", displayName);
    return request(`${casePath}/evidence`, form);
  }
  async function waitForAnalysis(status) {
    await request(`${casePath}/analyze`, {}, 202);
    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      const current = await request(casePath);
      if (current.status === status) return current;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error(`Case ${claim.id} did not reach ${status}. Check the local workflow logs.`);
  }

  for (const kind of ["bill", "discharge_summary"]) {
    await upload(kind, new File([packet[kind]], `${kind}.pdf`, { type: "application/pdf" }));
  }
  const incomplete = await waitForAnalysis("needs_documents");
  const missingRequest = incomplete.requests.find((entry) => entry.status === "open");
  assert.equal(missingRequest?.claimId, claim.id);
  assert.deepEqual(missingRequest.kinds, ["prescription"]);

  await upload("prescription", new File([packet.prescription], "prescription.pdf", { type: "application/pdf" }));
  const named = await upload("other", new File([image], basename(imagePath), { type: imageMime }), "Synthetic payment receipt photo");
  const supplemental = named.documents.find((entry) => entry.kind === "other");
  assert.equal(supplemental?.displayName, "Synthetic payment receipt photo");
  await request(`/evidence/${supplemental.id}`, undefined, 401, false);

  const ready = await waitForAnalysis("ready_for_review");
  assert.equal(ready.id, claim.id);
  assert.equal(ready.requests.find((entry) => entry.id === missingRequest.id)?.status, "answered");
  assert.equal(ready.recommendation.source, "azure");
  assert.deepEqual(ready.recommendation.missing, []);
  assert.ok(ready.recommendation.evidenceIds.includes(supplemental.id));
  assert.ok(ready.recommendation.findings.some((finding) => finding.evidenceIds.length >= 2));
  assert.equal(ready.recommendation.recommendedAmount, null);
  return { claimId: claim.id, completeness: "3/3", supplementalImageReviewed: true, findings: ready.recommendation.findings.length, proposedAmount: null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const privateKey = process.env.GUARDLINK_DEMO_PRIVATE_KEY;
  const [, , policyId, imagePath, incidentDate] = process.argv;
  if (!privateKey || !policyId || !imagePath) {
    throw new Error("Use a local test-wallet key in GUARDLINK_DEMO_PRIVATE_KEY and pass <policy-id> <synthetic-image> [incident-date].");
  }
  const result = await rehearseEvidence({ account: privateKeyToAccount(privateKey), policyId, imagePath, incidentDate });
  console.log(JSON.stringify(result, null, 2));
}
