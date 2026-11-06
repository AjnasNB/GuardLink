"use client";
import { useCallback, useEffect, useState } from "react";
import { Vote, ArrowUpRight } from "lucide-react";
import { parseUnits } from "viem";
import { api, type Config } from "../lib/api";
import { poolWrite } from "../lib/contracts";
type Proposal = {
  id: string;
  description: string;
  status: string;
  yesVotes: string;
  noVotes: string;
  eligible: string;
  deadline: number;
  hasVoted: boolean;
  canExecute: boolean;
};
type Run = (fn: () => Promise<unknown>, message?: string) => Promise<void>;
export default function Governance({
  config,
  busy,
  run,
}: {
  config: Config | null;
  busy: boolean;
  run: Run;
}) {
  const [proposals, setProposals] = useState<Proposal[]>([]),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setProposals(await api<Proposal[]>("/governance"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load proposals.");
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 12000);
    return () => clearInterval(timer);
  }, [load]);
  async function act(fn: () => Promise<unknown>, message: string) {
    await run(fn, message);
    await load();
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-note">GuardLink / Community decisions</span>
          <h1>Your voice. Our shared rules.</h1>
          <p>
            Members govern future coverage, contributions and how their
            cooperative runs.
          </p>
        </div>
      </div>
      <div className="governance-intro panel">
        <Vote size={30} />
        <div>
          <h2>One verified member. One vote.</h2>
          <p>
            A proposal needs half of its eligible membership to vote and
            two-thirds support among votes cast. Voting lasts 72 hours. Early
            execution requires every eligible member to vote. Changes preserve
            existing policies.
          </p>
        </div>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <section className="panel">
        <h2>Community proposals</h2>
        {proposals.length ? (
          proposals.map((p) => (
            <article className="proposal-row" key={p.id}>
              <div>
                <h3>{p.description}</h3>
                <span className="status-pill">{p.status}</span>
                <p>
                  {p.yesVotes} support · {p.noVotes} against · {p.eligible}{" "}
                  eligible
                </p>
                <small>
                  Voting deadline:{" "}
                  {new Date(p.deadline * 1000).toLocaleString()}
                </small>
              </div>
              {p.status === "Voting open" && !p.hasVoted && (
                <>
                  <button
                    disabled={busy}
                    className="button button-outline"
                    onClick={() =>
                      void act(
                        () =>
                          poolWrite(config?.poolAddress ?? "", "voteProposal", [
                            BigInt(p.id),
                            true,
                          ]),
                        "Your vote in support is confirmed.",
                      )
                    }
                  >
                    Support
                  </button>
                  <button
                    disabled={busy}
                    className="button button-outline"
                    onClick={() =>
                      void act(
                        () =>
                          poolWrite(config?.poolAddress ?? "", "voteProposal", [
                            BigInt(p.id),
                            false,
                          ]),
                        "Your vote against is confirmed.",
                      )
                    }
                  >
                    Against
                  </button>
                </>
              )}
              {p.hasVoted && (
                <span className="status-pill good">Your vote is recorded</span>
              )}
              {p.canExecute && (
                <button
                  disabled={busy}
                  className="button button-lime"
                  onClick={() =>
                    void act(async () => {
                      const tx = await poolWrite(
                        config?.poolAddress ?? "",
                        "executeProposal",
                        [BigInt(p.id)],
                      );
                      await api("/governance/sync", {
                        method: "POST",
                        body: JSON.stringify({ txHash: tx }),
                      });
                    }, "The approved proposal is executed.")
                  }
                >
                  Execute approved change
                </button>
              )}
            </article>
          ))
        ) : (
          <p>
            No proposals yet. Verified members can propose future coverage terms
            below.
          </p>
        )}
      </section>
      <form
        className="panel form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act(async () => {
            const tx = await poolWrite(
              config?.poolAddress ?? "",
              "proposeRules",
              [
                parseUnits(String(f.get("contribution")), 6),
                parseUnits(String(f.get("limit")), 6),
                Number(f.get("days")),
                String(f.get("description")),
              ],
            );
            await api("/governance/sync", {
              method: "POST",
              body: JSON.stringify({ txHash: tx }),
            });
          }, "Your proposal transaction is confirmed.");
        }}
      >
        <h2>Propose future coverage terms</h2>
        <label>
          Explain the change
          <textarea
            name="description"
            required
            rows={3}
            minLength={10}
            maxLength={1000}
          />
        </label>
        <div className="form-columns">
          <label>
            Contribution (USDC)
            <input
              name="contribution"
              type="number"
              min="0.000001"
              step="0.000001"
              defaultValue="1"
              required
            />
          </label>
          <label>
            Coverage limit (USDC)
            <input
              name="limit"
              type="number"
              min="0.000001"
              step="0.000001"
              defaultValue="6"
              required
            />
          </label>
          <label>
            Term (days)
            <input
              name="days"
              type="number"
              min="1"
              max="365"
              defaultValue="30"
              required
            />
          </label>
        </div>
        <button
          className="button button-lime"
          disabled={busy || !config?.poolAddress}
        >
          Sign and propose <ArrowUpRight size={17} />
        </button>
      </form>
    </>
  );
}
