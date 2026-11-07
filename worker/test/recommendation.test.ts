import { test } from "node:test";
import assert from "node:assert/strict";
import type { Evidence } from "@guardlink/domain";
import { analyzeDocuments } from "../src/adapters/azure.ts";

test("an AI amount needs the bill, is bounded by coverage and never uses an INR reference as USDC", async (t) => {
  const evidence = (id: string, kind: Evidence["kind"]) => ({ evidence: { id, kind, name: `${id}.pdf`, sha256: "synthetic", createdAt: "2026-11-07" }, data: "", mime: "application/pdf" });
  const docs = [evidence("current-bill", "bill"), evidence("discharge", "discharge_summary"), evidence("old-bill", "bill")];
  const checkedAt = "2026-11-07T00:00:00Z";
  let response = {
    summary: "Synthetic evidence", findings: [], amountStatus: "supported", recommendedAmount: "5.15",
    amountEvidenceId: "current-bill", procedureCode: "SE020A", procedureEvidenceId: "discharge",
  };
  t.mock.method(globalThis, "fetch", async () => Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify(response) }] }] }));
  const analyze = (remaining: bigint | null, community = "kerala-demo", requested = "5") =>
    analyzeDocuments("https://analysis.invalid", "model", "test-key", docs, 3, requested, remaining === null ? null : { remaining, checkedAt }, community);
  const result = await analyze(4_500_000n);
  assert.equal(result.recommendedAmount, "4.500000");
  assert.equal((await analyze(6_000_000n, "kerala-demo", "4.75")).recommendedAmount, "4.750000");
  assert.deepEqual(result.amountBasis, { documentedAmount: "5.15", requestedAmount: "5", remainingCoverage: "4.500000", evidenceId: "current-bill", checkedAt });
  assert.equal(result.pricingReference?.amountInr, "4500");
  assert.equal((await analyze(0n)).recommendedAmount, null);
  assert.equal((await analyze(null)).recommendedAmount, null);
  assert.equal((await analyze(4_500_000n, "another-community")).pricingReference, undefined);
  const valid = response;
  for (const fields of [{ amountEvidenceId: "old-bill" }, { amountEvidenceId: "discharge" }, { amountStatus: "conflicting" }, { recommendedAmount: "5 INR" }]) {
    response = { ...valid, ...fields };
    const missing = await analyze(4_500_000n);
    assert.equal(missing.recommendedAmount, null);
    assert.equal(missing.amountBasis, undefined);
  }
  response = { ...valid, procedureEvidenceId: "invented" };
  assert.equal((await analyze(4_500_000n)).pricingReference, undefined);
});
