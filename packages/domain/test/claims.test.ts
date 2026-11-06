import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addEvidence,
  applyRecommendation,
  checklist,
  microUsdc,
  openAppeal,
  publicClaim,
  recordBallot,
  type Claim,
} from "../src/index.ts";
const fixture = (): Claim => ({
  id: "case-1",
  memberId: "member",
  communityId: "community",
  policyId: "policy",
  title: "Private title",
  description: "Private diagnosis",
  requestedAmount: "10",
  incidentDate: "2026-11-05",
  status: "submitted",
  documents: [],
  requests: [],
  jurors: ["j1", "j2", "j3"],
  votes: [],
  appealJurors: [],
  appealVotes: [],
  appealed: false,
  revision: 0,
  createdAt: "now",
});
test("USDC precision is exact and invalid representations fail", () => {
  assert.equal(microUsdc("1.000001"), 1000001n);
  for (const n of ["-1", "1e5", "NaN", "1.0000001"])
    assert.throws(() => microUsdc(n));
});
test("follow-up requests retain member and case IDs and deduplicate", () => {
  let c = fixture();
  c = applyRecommendation(c, checklist([], 0), "r1", "now");
  c = applyRecommendation(c, checklist([], 0), "r2", "now");
  assert.equal(c.requests.length, 1);
  assert.equal(c.requests[0].claimId, "case-1");
  assert.equal(c.requests[0].memberId, "member");
  c = addEvidence(c, "member", {
    id: "e1",
    kind: "bill",
    name: "bill.pdf",
    sha256: "hash",
    createdAt: "now",
  });
  assert.equal(c.id, "case-1");
  assert.throws(() =>
    addEvidence(c, "other", {
      id: "e2",
      kind: "bill",
      name: "x",
      sha256: "other",
      createdAt: "now",
    }),
  );
  assert.throws(() => applyRecommendation(c, checklist([], 0), "r3", "now"));
});
test("only two matching authorized ballots approve and duplicate votes fail", () => {
  let c = { ...fixture(), status: "under_review" } as Claim;
  assert.throws(() =>
    recordBallot(c, {
      jurorId: "member",
      approve: true,
      amount: "10",
      reason: "yes",
    }),
  );
  c = recordBallot(c, {
    jurorId: "j1",
    approve: true,
    amount: "8",
    reason: "Covered amount",
  });
  assert.equal(c.status, "under_review");
  assert.throws(() =>
    recordBallot(c, {
      jurorId: "j1",
      approve: true,
      amount: "8",
      reason: "repeat",
    }),
  );
  c = recordBallot(c, {
    jurorId: "j2",
    approve: true,
    amount: "9",
    reason: "Different amount",
  });
  assert.equal(c.status, "under_review");
  c = recordBallot(c, {
    jurorId: "j3",
    approve: true,
    amount: "8",
    reason: "Covered amount",
  });
  assert.equal(c.status, "approved");
  assert.equal(c.approvedAmount, "8");
});
test("an appeal excludes original jurors and can only happen once", () => {
  const c = { ...fixture(), status: "rejected" } as Claim;
  assert.throws(() => openAppeal(c, "member", ["j1", "a2", "a3"]));
  const a = openAppeal(c, "member", ["a1", "a2", "a3"]);
  assert.equal(a.id, c.id);
  assert.throws(() =>
    openAppeal({ ...a, status: "rejected" }, "member", ["a1", "a2", "a3"]),
  );
});
test("public projection never exposes medical evidence or identity", () => {
  const publicData = JSON.stringify(publicClaim(fixture()));
  for (const secret of [
    "Private diagnosis",
    "Private title",
    "memberId",
    "documents",
    "recommendation",
  ])
    assert.equal(publicData.includes(secret), false);
});
