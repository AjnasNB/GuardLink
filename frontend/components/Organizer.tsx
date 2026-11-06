"use client";
import { useCallback, useEffect, useState } from "react";
import { api, short, type Config } from "../lib/api";
import { poolAbi, poolWrite, publicClient } from "../lib/contracts";
type RosterMember = {
  id: string;
  wallet: string;
  name: string;
  role: string;
  verified: number;
  request_status: string | null;
  accepted_criteria: string | null;
};
type Case = {
  id: string;
  chainClaimId: string;
  status: string;
  claimantId: string;
  contactId: string | null;
  jurors: string[];
  appealJurors: string[];
};
type Data = {
  members: RosterMember[];
  cases: Case[];
  community: { joiningCriteria: string } | null;
  notice: string;
};
type Run = (fn: () => Promise<unknown>, message?: string) => Promise<void>;

function JurySelection({ candidates, busy, assign }: {
  candidates: RosterMember[];
  busy: boolean;
  assign: (wallets: [string, string, string]) => void;
}) {
  const [selected, setSelected] = useState<[string, string, string]>(["", "", ""]);
  const eligible = new Set(candidates.map((member) => member.wallet.toLowerCase()));
  const ready = selected.every((wallet) => eligible.has(wallet.toLowerCase())) && new Set(selected.map((wallet) => wallet.toLowerCase())).size === 3;
  return (
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault();
      if (ready && !busy) assign(selected);
    }}>
      <p>{candidates.length} eligible {candidates.length === 1 ? "member" : "members"} for this case. Select three to continue.</p>
      {candidates.length < 3 ? <p role="status">This case needs at least three eligible members before review can begin.</p> : (
        <>
          <div className="form-columns">
            {selected.map((wallet, index) => (
              <label key={index}>
                Juror {index + 1}
                <select required value={eligible.has(wallet.toLowerCase()) ? wallet : ""} onChange={(event) => {
                  const next: [string, string, string] = [...selected];
                  next[index] = event.target.value;
                  setSelected(next);
                }}>
                  <option value="">Select an eligible member</option>
                  {candidates.map((member) => (
                    <option key={member.id} value={member.wallet} disabled={selected.some((choice, slot) => slot !== index && choice.toLowerCase() === member.wallet.toLowerCase())}>
                      {member.name} · {short(member.wallet)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button className="button button-lime" disabled={busy || !ready}>Sign jury assignment</button>
        </>
      )}
    </form>
  );
}

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
          <p>Verify members and appoint three jurors for each case.</p>
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
            {data.community && <p className="subtle community-description">{data.community.joiningCriteria}</p>}
            {data.members.map((m) => (
              <article className="proposal-row" key={m.id}>
                <div>
                  <h3>{m.name}</h3>
                  <small>
                    {m.wallet} · {m.role}
                  </small>
                  {!m.verified && m.accepted_criteria && (
                    <details>
                      <summary>{m.accepted_criteria === data.community?.joiningCriteria ? "Accepted joining criteria" : "Criteria accepted before the latest edit"}</summary>
                      <p className="community-description">{m.accepted_criteria}</p>
                    </details>
                  )}
                </div>
                <span className="status-pill">
                  {m.verified ? "Verified" : m.request_status ? "Requested" : "No request"}
                </span>
                <button
                  className="button button-outline"
                  disabled={busy || !config?.poolAddress || (!m.verified && !m.request_status)}
                  onClick={() =>
                    void act(async () => {
                      const address = config?.poolAddress as `0x${string}`;
                      const wallet = m.wallet as `0x${string}`;
                      const verified = await publicClient.readContract({
                        address, abi: poolAbi, functionName: "verifiedMembers", args: [wallet],
                      });
                      if (verified !== !m.verified) {
                        await poolWrite(address, "verifyMember", [wallet, !m.verified]);
                      }
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
            <h2>Jury assignments</h2>
            <p>The operator selects the panel. Two matching votes decide the case. Appeals use three different jurors.</p>
            {!data.cases.length && <p>No cases are awaiting a panel. A case appears here after registration on Arc, or when an appeal is filed.</p>}
            {data.cases.map((cl) => {
              const appeal = cl.status === "appealed",
                alreadyAssigned = appeal
                  ? cl.appealJurors.length > 0
                  : cl.jurors.length > 0;
              const candidates = data.members.filter(
                (m) =>
                  m.verified &&
                  m.id !== cl.claimantId &&
                  m.id !== cl.contactId &&
                  m.role !== "contact" &&
                  (!appeal || !cl.jurors.includes(m.id)),
              );
              return (
                <article className="form-stack" key={cl.id + (appeal ? "-appeal" : "-initial")}>
                  <h3>
                    GL-{cl.id.slice(0, 8).toUpperCase()} ·{" "}
                    {appeal ? "Independent appeal" : "Initial review"}
                  </h3>
                  {alreadyAssigned ? (
                    <p>This panel has already been assigned.</p>
                  ) : <JurySelection candidates={candidates} busy={busy || !config?.poolAddress} assign={(jurors) => {
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
                  }} />}
                </article>
              );
            })}
          </section>
        </>
      )}
    </>
  );
}
