"use client";

import { useCallback, useEffect, useState } from "react";
import { payoutChallengeReasons } from "@guardlink/domain";
import { api } from "../lib/api";
import { poolWrite } from "../lib/contracts";

type Review = {
  claimId: `0x${string}`;
  settleAfter: number;
  canChallenge: boolean;
  reviewPending: boolean;
  provisionalApproval: boolean;
};

export default function PayoutChallenge({ caseId, pool }: { caseId: string; pool: string }) {
  const [review, setReview] = useState<Review | null>(null);
  const [receipt, setReceipt] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await api<{ review: Review | null }>(`/claims/${encodeURIComponent(caseId)}/payout-review`, { signal });
    if (!signal?.aborted) {
      setReview(data.review);
      setUnavailable(false);
    }
  }, [caseId]);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => void load(controller.signal).catch(() => {
      if (!controller.signal.aborted) setUnavailable(true);
    });
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [load]);

  async function record(reason: number) {
    if (!receipt && !review?.canChallenge) return;
    setBusy(true);
    setError("");
    try {
      const txHash = receipt ?? await poolWrite(pool, "challengeClaim", [review?.claimId, reason]);
      setReceipt(txHash);
      await api(`/claims/${encodeURIComponent(caseId)}/sync`, {
        method: "POST", body: JSON.stringify({ txHash }),
      });
      setReceipt(undefined);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record the challenge.");
    } finally {
      setBusy(false);
    }
  }

  if (!receipt && !error && !unavailable && !review?.reviewPending && !review?.provisionalApproval) return null;
  return (
    <section className="panel form-stack" aria-labelledby="payout-review-title">
      <h2 id="payout-review-title">Payout review</h2>
      {review?.reviewPending && <p>A member flagged this decision. Payment is on hold while a separate panel reviews the claim.</p>}
      {review?.provisionalApproval && <p>Earliest settlement: {new Date(review.settleAfter * 1000).toLocaleString()}.</p>}
      {error && <p role="alert" className="error-text">{error}</p>}
      {unavailable && <p role="status">Could not check the payout review. This page will retry.</p>}
      {receipt ? (
        <button type="button" className="button button-outline" disabled={busy} onClick={() => void record(0)}>
          Retry recording the confirmed challenge
        </button>
      ) : review?.canChallenge && (
        <form className="form-stack" onSubmit={(event) => {
          event.preventDefault();
          void record(Number(new FormData(event.currentTarget).get("reason")));
        }}>
          <label>
            Why should the approval be reviewed?
            <select name="reason" required defaultValue="">
              <option value="" disabled>Choose a reason</option>
              {Object.entries(payoutChallengeReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="submit" className="button button-outline" disabled={busy || unavailable}>Flag for independent review</button>
        </form>
      )}
    </section>
  );
}
