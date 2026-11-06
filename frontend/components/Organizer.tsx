"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type Config } from "../lib/api";
import { poolWrite } from "../lib/contracts";
type RosterMember = {
  id: string;
  wallet: string;
  name: string;
  role: string;
  verified: number;
};
type Case = {
  id: string;
  chainClaimId: string;
  status: string;
  claimantId: string;
  jurors: string[];
  appealJurors: string[];
};
type Data = { members: RosterMember[]; cases: Case[]; notice: string };
type Run = (fn: () => Promise<unknown>, message?: string) => Promise<void>;
export default function Organizer({
  config,
  busy,
  run,
}: {
  config: Config | null;
  busy: boolean;
  run: Run;
}) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await api<Data>("/organizer"));
      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not load the operator workspace.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function act(fn: () => Promise<unknown>, message: string) {
    await run(fn, message);
    await load();
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-note">Cooperative operations</span>
          <h1>Set up a fair review.</h1>
          <p>Verify membership and appoint eligible, conflict-free panels.</p>
        </div>
      </div>
      {error && (
        <div className="inline-note">
          {error} Sign in with the designated operator account. Regular members
          cannot change membership or assign jurors.
        </div>
      )}
      {data && (
        <>
          <p className="inline-note">{data.notice}</p>
          <section className="panel">
            <h2>Membership verification</h2>
            {data.members.map((m) => (
              <article className="proposal-row" key={m.id}>
                <div>
                  <h3>{m.name}</h3>
                  <small>
                    {m.wallet} · {m.role}
                  </small>
                </div>
                <span className="status-pill">
                  {m.verified ? "Verified" : "Pending verification"}
                </span>
                <button
                  className="button button-outline"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await poolWrite(
                        config?.poolAddress ?? "",
                        "verifyMember",
                        [m.wallet, !m.verified],
                      );
                      await api("/organizer/membership/sync", {
                        method: "POST",
                        body: JSON.stringify({ memberId: m.id }),
                      });
                    }, "Membership updated from the confirmed contract state.")
                  }
                >
                  {m.verified ? "Revoke eligibility" : "Verify member"}
                </button>
              </article>
            ))}
          </section>
          <section className="panel form-stack">
            <h2>Cases awaiting a panel</h2>
            {!data.cases.length && <p>No cases awaiting assignment.</p>}
            {data.cases.map((cl) => {
              const appeal = cl.status === "appealed",
                alreadyAssigned = appeal
                  ? cl.appealJurors.length > 0
                  : cl.jurors.length > 0;
              const candidates = data.members.filter(
                (m) =>
                  m.verified &&
                  m.id !== cl.claimantId &&
                  m.role !== "contact" &&
                  (!appeal || !cl.jurors.includes(m.id)),
              );
              return (
                <form
                  className="form-stack"
                  key={cl.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const jurors = ["first", "second", "third"].map((k) =>
                      String(f.get(k)),
                    );
                    if (new Set(jurors).size !== 3) {
                      void run(async () => {
                        throw new Error("Choose three different jurors.");
                      });
                      return;
                    }
                    void act(async () => {
                      const tx = await poolWrite(
                        config?.poolAddress ?? "",
                        appeal ? "assignAppealJury" : "assignJury",
                        [cl.chainClaimId, jurors],
                      );
                      await api(`/claims/${cl.id}/sync`, {
                        method: "POST",
                        body: JSON.stringify({ txHash: tx }),
                      });
                    }, "The jury assignment is confirmed.");
                  }}
                >
                  <h3>
                    GL-{cl.id.slice(0, 8).toUpperCase()} ·{" "}
                    {appeal ? "Independent appeal" : "Initial review"}
                  </h3>
                  {alreadyAssigned ? (
                    <p>This panel has already been assigned.</p>
                  ) : (
                    <>
                      <div className="form-columns">
                        {["first", "second", "third"].map((key, i) => (
                          <label key={key}>
                            Juror {i + 1}
                            <select name={key} required defaultValue="">
                              <option value="">
                                Select an eligible member
                              </option>
                              {candidates.map((m) => (
                                <option key={m.id} value={m.wallet}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                      <button className="button button-lime" disabled={busy}>
                        Sign jury assignment
                      </button>
                    </>
                  )}
                </form>
              );
            })}
          </section>
        </>
      )}
    </>
  );
}
