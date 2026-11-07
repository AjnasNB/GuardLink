"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Check,
  ExternalLink,
  FileText,
  LockKeyhole,
  Plus,
  Scale,
  ShieldCheck,
  Upload,
  Vote,
} from "lucide-react";
import { keccak256, toBytes, parseUnits } from "viem";
import {
  evidenceNameLimit,
  microUsdc,
  requiredDocuments,
  type Claim,
  type DocumentKind,
} from "@guardlink/domain";
import { api, money, type Config, type Member } from "../lib/api";
import { poolWrite } from "../lib/contracts";
import { PageHeading, Status } from "./WorkspaceParts";
import EvidenceReview, {
  documentLabels,
  evidenceLabel,
} from "./EvidenceReview";
type Run = (fn: () => Promise<unknown>, message?: string) => Promise<void>;
export default function ClaimDetail({
  id,
  member,
  config,
  busy,
  run,
}: {
  id: string;
  member: Member | null;
  config: Config | null;
  busy: boolean;
  run: Run;
}) {
  const [claim, setClaim] = useState<Claim | null>(null),
    [error, setError] = useState("");
  const [uploadKind, setUploadKind] = useState<DocumentKind | "">("");
  const load = useCallback(
    () =>
      api<Claim>(`/claims/${id}`)
        .then(setClaim)
        .catch((e) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 8000);
    return () => clearInterval(timer);
  }, [load]);
  async function execute(fn: () => Promise<unknown>, message: string) {
    await run(fn, message);
    await load();
  }
  if (error) return <div className="alert error">{error}</div>;
  if (!claim) return <div className="loading-state">Loading your case…</div>;
  const owner = member?.id === claim.memberId;
  const missing = requiredDocuments.filter((kind) =>
    !claim.documents.some((document) => document.kind === kind),
  );
  const selectedKind = uploadKind || missing[0] || "other";
  const currentPanel =
    claim.status === "appealed" ? claim.appealJurors : claim.jurors;
  const currentVotes =
    claim.status === "appealed" ? claim.appealVotes : claim.votes;
  const reviewer =
    currentPanel.includes(member?.id ?? "") &&
    !currentVotes.some((ballot) => ballot.jurorId === member?.id);
  const reviewAmount = claim.requestedAmount;
  const currentSuggestion = claim.recommendation?.revision === claim.revision && claim.recommendation.source === "azure"
    ? claim.recommendation.recommendedAmount : null;
  const suggestedAmount = currentSuggestion && /^(0|[1-9]\d*)(\.\d{1,6})?$/.test(currentSuggestion) &&
    microUsdc(currentSuggestion) > 0n && microUsdc(currentSuggestion) <= microUsdc(reviewAmount) ? currentSuggestion : null;
  const clientId = keccak256(toBytes(claim.id));
  const digest = claim.chainClaimId as `0x${string}`;
  return (
    <>
      <Link href="/app/claims" className="back-link">
        ← All claims
      </Link>
      <PageHeading
        title={claim.title}
        description={`Case GL-${claim.id.slice(0, 8).toUpperCase()} · One case, every update.`}
        action={<Status status={claim.status} />}
      />
      <div className="case-grid">
        <div className="case-main">
          <section className="panel">
            <div className="section-row">
              <h2>Your case</h2>
              <span>{money(claim.requestedAmount)} USDC requested</span>
            </div>
            <p>{claim.description}</p>
            <p className="subtle">
              Treatment date: {new Date(claim.incidentDate).toLocaleString()} ·
              Policy #{claim.policyId}
            </p>
          </section>
          {claim.requests
            .filter((r) => r.status === "open")
            .map((r) => ({
              ...r,
              kinds: r.kinds.filter((kind) => missing.includes(kind)),
            }))
            .filter((r) => r.kinds.length > 0)
            .map((r) => (
              <section className="panel request-panel" key={r.id}>
                <div className="section-row">
                  <h2>
                    <AlertCircle size={19} /> A little more information
                  </h2>
                </div>
                <p>
                  Please add:{" "}
                  {r.kinds.map((kind) => documentLabels[kind]).join(", ")}.
                </p>
                <small>
                  This request belongs to this same case. You do not need to
                  start again.
                </small>
                {owner && (
                  <a
                    className="text-link"
                    href="#claim-evidence-upload"
                    onClick={() => setUploadKind(r.kinds[0])}
                  >
                    Add requested document <ArrowRight size={15} />
                  </a>
                )}
              </section>
            ))}
          {claim.requests.some((request) => request.status === "answered") && (
            <section className="panel">
              <div className="section-row">
                <h2>Document follow-up</h2>
                <span className="status-pill good">Answered</span>
              </div>
              {claim.requests
                .filter((request) => request.status === "answered")
                .map((request) => (
                  <div className="finding" key={request.id}>
                    <strong>
                      {request.kinds
                        .map((kind) => documentLabels[kind])
                        .join(", ")}
                    </strong>
                    <p>
                      Requested and supplied under case GL-
                      {claim.id.slice(0, 8).toUpperCase()}.
                    </p>
                  </div>
                ))}
            </section>
          )}
          <section className="panel">
            <div className="section-row">
              <h2>Private documents</h2>
              <LockKeyhole size={17} />
            </div>
            {claim.documents.map((d) => (
              <a
                className="document-row"
                key={d.id}
                href={`/api/v1/evidence/${d.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <FileText size={19} />
                <span>
                  {evidenceLabel(d)}
                  <small>
                    Added {new Date(d.createdAt).toLocaleDateString()}
                    {d.swarmReference ? " · Encrypted archive" : ""}
                  </small>
                </span>
                <ExternalLink size={16} />
              </a>
            ))}
            {!claim.documents.length && (
              <p className="subtle">
                Add the bill, discharge summary and prescription for this case.
              </p>
            )}
            {owner &&
              ["submitted", "needs_documents", "analyzing"].includes(
                claim.status,
              ) && (
                <form
                  id="claim-evidence-upload"
                  className="upload-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    void execute(
                      async () => {
                        await api(`/claims/${id}/evidence`, {
                          method: "POST",
                          body: new FormData(form),
                        });
                        form.reset();
                        setUploadKind("");
                      },
                      "Document added to the same case.",
                    );
                  }}
                >
                  <label>
                    Document type
                    <select
                      name="kind"
                      value={selectedKind}
                      onChange={(event) => setUploadKind(event.target.value as DocumentKind)}
                    >
                      {([...requiredDocuments, "other"] as const).map((kind) => (
                        <option key={kind} value={kind}>
                          {documentLabels[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedKind === "other" && (
                    <label>
                      Document name
                      <input
                        name="displayName"
                        maxLength={evidenceNameLimit}
                        placeholder="For example, itemized receipt"
                        required
                      />
                    </label>
                  )}
                  <label className="file-picker">
                    <Upload size={20} />
                    <span>Choose PDF, JPEG or PNG · up to 1 MB</span>
                    <input
                      type="file"
                      name="file"
                      accept="application/pdf,image/jpeg,image/png"
                      required
                    />
                  </label>
                  <button disabled={busy} className="button button-outline">
                    Add document <Plus size={16} />
                  </button>
                </form>
              )}
          </section>
          <EvidenceReview documents={claim.documents} recommendation={claim.recommendation} revision={claim.revision} />
          {!!claim.votes.length && (
            <section className="panel">
              <h2>How reviewers decided</h2>
              {[
                { name: "Initial jury", ballots: claim.votes },
                { name: "Independent appeal", ballots: claim.appealVotes },
              ]
                .filter((round) => round.ballots.length)
                .map((round) => (
                  <div key={round.name}>
                    <h3 style={{ marginTop: 24, marginBottom: 12 }}>
                      {round.name}
                    </h3>
                    {round.ballots.map((ballot) => (
                      <div className="finding" key={ballot.jurorId}>
                        <strong>
                          {ballot.approve
                            ? `Approve ${money(ballot.amount)} USDC`
                            : "Not approved"}{" "}
                          · {ballot.jurorId}
                        </strong>
                        <p style={{ overflowWrap: "anywhere" }}>
                          {ballot.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
            </section>
          )}
          {reviewer && ["under_review", "appealed"].includes(claim.status) && (
            <form
              key={`${claim.id}:${claim.status}:${claim.revision}`}
              className="panel form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const approve = form.get("decision") === "approve";
                void execute(async () => {
                  const amount = approve ? microUsdc(String(form.get("amount"))) : 0n;
                  if (approve && (amount <= 0n || amount > microUsdc(reviewAmount))) {
                    throw new Error(`Enter an amount above zero and no higher than ${reviewAmount} test USDC.`);
                  }
                  const tx = await poolWrite(
                    config?.poolAddress ?? "",
                    claim.status === "appealed" ? "appealVote" : "vote",
                    [
                      digest,
                      approve,
                      amount,
                      keccak256(toBytes(String(form.get("reason")))),
                    ],
                  );
                  await api(`/claims/${id}/sync`, {
                    method: "POST",
                    body: JSON.stringify({
                      txHash: tx,
                      reason: String(form.get("reason")),
                      appealRound: claim.status === "appealed",
                    }),
                  });
                }, "Your vote is confirmed.");
              }}
            >
              <h2>Your review</h2>
              <p>{suggestedAmount ? `AI suggested ${money(suggestedAmount)} test USDC. Check the supporting evidence and change the amount if your review supports a different figure.` : "No AI suggestion is available within this round’s limit. Enter the amount your review supports if you approve."} Explain your decision below.</p>
              <label>
                Decision
                <select name="decision">
                  <option value="approve">Approve covered support</option>
                  <option value="reject">Do not approve</option>
                </select>
              </label>
              <label>
                Approved amount (USDC)
                <input
                  name="amount"
                  type="number"
                  defaultValue={suggestedAmount ?? ""}
                  max={reviewAmount}
                  min="0.000001"
                  step="0.000001"
                />
              </label>
              <label>
                Reason for your decision
                <textarea
                  name="reason"
                  rows={3}
                  required
                  minLength={5}
                  maxLength={1000}
                  placeholder="Explain the evidence and coverage rule you relied on."
                />
              </label>
              <button className="button button-lime" disabled={busy}>
                Sign and record my vote <Vote size={17} />
              </button>
            </form>
          )}
        </div>
        <aside className="case-aside">
          {owner && claim.status === "awaiting_jury" && (
            <form
              className="panel form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const contact = String(
                  new FormData(e.currentTarget).get("contact"),
                );
                void execute(async () => {
                  const tx = await poolWrite(
                    config?.poolAddress ?? "",
                    "setClaimContact",
                    [digest, contact],
                  );
                  await api(`/claims/${id}/sync`, {
                    method: "POST",
                    body: JSON.stringify({ txHash: tx }),
                  });
                }, "Your chosen helper can now access this case.");
              }}
            >
              <h3>Choose a local helper</h3>
              <p className="subtle">
                Optional. This shares your evidence with the selected helper and
                excludes them from this case’s jury. Choose someone you trust.
              </p>
              <label>
                Helper wallet
                <input
                  name="contact"
                  required
                  pattern="0x[0-9a-fA-F]{40}"
                  placeholder="0x…"
                />
              </label>
              <button className="button button-outline" disabled={busy}>
                Authorize helper access
              </button>
            </form>
          )}
          <section className="panel">
            <h3>Where your case stands</h3>
            <ol className="case-timeline">
              {[
                "Submitted",
                "Evidence prepared",
                "Jury decision",
                "Payment confirmed",
              ].map((s, i) => (
                <li
                  key={s}
                  className={
                    i === 0 ||
                    (i === 1 && !!claim.recommendation) ||
                    (i === 2 &&
                      [
                        "approved",
                        "rejected",
                        "paid",
                        "appealed",
                        "awaiting_funds",
                      ].includes(claim.status)) ||
                    (i === 3 && claim.status === "paid")
                      ? "done"
                      : ""
                  }
                >
                  <span>
                    <Check size={12} />
                  </span>
                  <div>
                    {s}
                    {i === 0 && (
                      <small>
                        {new Date(claim.createdAt).toLocaleDateString()}
                      </small>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {owner &&
              ["submitted", "needs_documents"].includes(claim.status) && (
                <button
                  className="button button-lime full-width"
                  disabled={busy}
                  onClick={() =>
                    void execute(
                      () => api(`/claims/${id}/analyze`, { method: "POST" }),
                      "Evidence preparation requested. This page will update.",
                    )
                  }
                >
                  Prepare my evidence <ArrowRight size={16} />
                </button>
              )}
            {owner && claim.status === "ready_for_review" && (
              <button
                disabled={busy}
                className="button button-lime full-width"
                onClick={() =>
                  void execute(async () => {
                    const tx = await poolWrite(
                      config?.poolAddress ?? "",
                      "submitClaim",
                      [
                        clientId,
                        BigInt(claim.policyId),
                        parseUnits(claim.requestedAmount, 6),
                        BigInt(
                          Math.floor(
                            new Date(claim.incidentDate).getTime() / 1000,
                          ),
                        ),
                        keccak256(
                          toBytes(
                            claim.documents.map((d) => d.sha256).join(":"),
                          ),
                        ),
                      ],
                    );
                    await api(`/claims/${id}/sync`, {
                      method: "POST",
                      body: JSON.stringify({ txHash: tx }),
                    });
                  }, "Your case is registered for jury review.")
                }
              >
                Send for review <ArrowRight size={16} />
              </button>
            )}
            {owner && claim.status === "rejected" && !claim.appealed && (
              <button
                className="button button-outline full-width"
                disabled={busy}
                onClick={() =>
                  void execute(async () => {
                    const tx = await poolWrite(
                      config?.poolAddress ?? "",
                      "appeal",
                      [digest],
                    );
                    await api(`/claims/${id}/sync`, {
                      method: "POST",
                      body: JSON.stringify({ txHash: tx }),
                    });
                  }, "Your independent appeal is requested.")
                }
              >
                Request an appeal <Scale size={17} />
              </button>
            )}
            {["approved", "awaiting_funds"].includes(claim.status) && (
              <button
                className="button button-lime full-width"
                disabled={busy}
                onClick={() =>
                  void execute(async () => {
                    const tx = await poolWrite(
                      config?.poolAddress ?? "",
                      "settle",
                      [digest],
                    );
                    await api(`/claims/${id}/sync`, {
                      method: "POST",
                      body: JSON.stringify({ txHash: tx }),
                    });
                  }, "Payment confirmed to the claimant wallet.")
                }
              >
                Release approved payment <ArrowUpRight size={16} />
              </button>
            )}
            {claim.transactionHash && (
              <a
                className="text-link"
                href={`https://testnet.arcscan.app/tx/${claim.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View payment receipt <ExternalLink size={15} />
              </a>
            )}
            <Link className="text-link" href={`/app/transparency?caseId=${id}`}>
              Follow public milestones <ArrowUpRight size={15} />
            </Link>
          </section>
          <div className="quiet-banner">
            <ShieldCheck size={20} />
            <p>
              People make the decision. If a claim is rejected, a different
              panel can review one appeal.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
