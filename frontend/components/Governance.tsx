"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { formatUnits, parseUnits } from "viem";
import { api, type Config, type Member } from "../lib/api";
import { poolWrite } from "../lib/contracts";
import { PageHeading } from "./WorkspaceParts";

const base = "/app/governance";
const pages = [
  ["Overview", base],
  ["Proposals", base + "/proposals"],
  ["Treasury", base + "/treasury"],
  ["Voting rules", base + "/rules"],
] as const;

type Proposal = {
  id: string;
  description: string;
  status: string;
  yesVotes: string;
  noVotes: string;
  eligible: string;
  deadline: number;
  hasVoted: boolean;
  canVote: boolean;
  canExecute: boolean;
  proposer: string;
  terms: { contribution: string; limit: string; days: number } | null;
  transfer: { recipient: string; amount: string } | null;
};
type Treasury = { available: string; committed: string; exposure: string };
type Run = (fn: () => Promise<unknown>, message?: string) => Promise<void>;

function proposalTitle(proposal: Proposal) {
  return proposal.description.startsWith("Title: ")
    ? proposal.description.slice(7).split("\n")[0]
    : proposal.description;
}

function VotingRules() {
  return (
    <section className="panel governance-copy">
      <h2>One verified member, one vote</h2>
      <p>Eligibility is recorded when the proposal opens. At least half the eligible members must vote and at least two-thirds of votes cast must support it.</p>
      <p>Voting lasts 72 hours. If everyone eligible votes and the proposal passes, it can be executed early. New coverage terms apply to future policies.</p>
      <p>Members cast their own votes. Case jurors review claims in a separate process.</p>
    </section>
  );
}

function TreasuryView() {
  const [data, setData] = useState<Treasury | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api<Treasury>("/governance/treasury").then((value) => {
      if (active) setData(value);
    }).catch((e: Error) => {
      if (active) setError(e.message);
    });
    return () => { active = false; };
  }, []);
  return (
    <section className="panel governance-copy">
      <h2>Cooperative treasury</h2>
      <p>Amounts come from the pool on Arc Testnet.</p>
      {error && <p role="alert" className="error-text">{error}</p>}
      {!data && !error && <p role="status">Loading treasury balances…</p>}
      {data && (
        <dl className="governance-tally">
          <div><dt>Free treasury</dt><dd>{data.available} USDC</dd></div>
          <div><dt>Approved payouts</dt><dd>{data.committed} USDC</dd></div>
          <div><dt>Open claim exposure</dt><dd>{data.exposure} USDC</dd></div>
        </dl>
      )}
      <Link className="text-link" href="/app/transparency">Follow the fund <ArrowRight size={16} /></Link>
    </section>
  );
}

function ProposalForm({ canPropose, busy, publish }: {
  canPropose: boolean;
  busy: boolean;
  publish: (terms: [bigint, bigint, number, string]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<[bigint, bigint, number, string] | null>(null);
  function preview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const sections = [["Title", "title"], ["Summary", "summary"], ["Why this matters", "rationale"], ["Timing and impact", "impact"], ["Conflicts of interest", "conflicts"]];
    const description = sections.map(([label, name]) => label + ": " + String(form.get(name)).trim()).join("\n\n");
    setDraft([parseUnits(String(form.get("contribution")), 6), parseUnits(String(form.get("limit")), 6), Number(form.get("days")), description]);
  }
  if (!canPropose) return <p className="panel">Connect a verified member wallet to propose a change.</p>;
  return (
    <section className="panel form-stack governance-copy">
      <h2>Propose future coverage terms</h2>
      <p>Explain the change members will vote on. Proposal text is public. Keep personal and medical information out of it.</p>
      <form className="form-stack" onSubmit={preview} hidden={Boolean(draft)}>
        <label>Proposal title<input name="title" required minLength={4} maxLength={80} /></label>
        <label>Summary<textarea name="summary" required rows={2} maxLength={240} /></label>
        <label>Why this matters<textarea name="rationale" required rows={3} maxLength={300} /></label>
        <label>Timing and impact<textarea name="impact" required rows={2} maxLength={240} placeholder="Who benefits, and when should the new terms take effect?" /></label>
        <label>Conflicts of interest<input name="conflicts" required maxLength={110} placeholder="Enter None if there are no conflicts" /></label>
        <div className="form-columns">
          <label>Contribution (USDC)<input name="contribution" type="number" min="0.000001" step="0.000001" required /></label>
          <label>Coverage limit (USDC)<input name="limit" type="number" min="0.000001" step="0.000001" required /></label>
          <label>Term (days)<input name="days" type="number" min="1" max="365" required /></label>
        </div>
        <button className="button button-lime">Review proposal <ArrowRight size={17} /></button>
      </form>
      {draft && (
        <div className="form-stack">
          <h3>Review before signing</h3>
          <p className="governance-description">{draft[3]}</p>
          <Terms terms={{ contribution: formatUnits(draft[0], 6), limit: formatUnits(draft[1], 6), days: draft[2] }} />
          <div className="governance-actions">
            <button className="button button-outline" disabled={busy} onClick={() => setDraft(null)}>Edit draft</button>
            <button className="button button-lime" disabled={busy} onClick={() => void publish(draft)}>Sign and publish</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Terms({ terms }: { terms: NonNullable<Proposal["terms"]> }) {
  return <dl className="governance-tally">
    <div><dt>Contribution</dt><dd>{terms.contribution} USDC</dd></div>
    <div><dt>Coverage limit</dt><dd>{terms.limit} USDC</dd></div>
    <div><dt>Policy term</dt><dd>{terms.days} days</dd></div>
  </dl>;
}

export default function Governance({ config, member, busy, run, route }: {
  config: Config | null;
  member: Member | null;
  busy: boolean;
  run: Run;
  route: string;
}) {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const isDetail = route.startsWith("/governance/proposals/");
  const proposal = isDetail ? proposals?.find((p) => p.id === route.split("/").at(-1)) : undefined;
  const canPropose = Boolean(config?.poolAddress && member?.wallet && member?.verified);
  const needsProposals = route === "/governance" || route === "/governance/proposals" || isDetail;
  const load = useCallback(async () => {
    try {
      setProposals(await api<Proposal[]>("/governance"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load proposals.");
    }
  }, []);
  useEffect(() => {
    if (!needsProposals) return;
    void load();
    const timer = setInterval(() => void load(), 12000);
    return () => clearInterval(timer);
  }, [load, needsProposals]);
  async function write(name: string, args: readonly unknown[], message: string, sync = false) {
    await run(async () => {
      const txHash = await poolWrite(config?.poolAddress ?? "", name, args);
      if (sync) await api("/governance/sync", { method: "POST", body: JSON.stringify({ txHash }) });
    }, message);
    if (needsProposals) await load();
  }
  const displayed = proposals?.filter((p) => filter === "all" || (filter === "open" ? p.status === "Voting open" : p.status !== "Voting open"));
  return (
    <>
      <PageHeading title="Community governance" description="Review proposals and vote on how your cooperative operates." action={canPropose && route !== "/governance/new" ? (
        <Link className="button button-lime" href={base + "/new"}>New proposal <ArrowRight size={17} /></Link>
      ) : undefined} />
      <nav aria-label="Governance pages" className="governance-nav">
        {pages.map(([label, href]) => <Link key={href} href={href} aria-current={route === href.slice(4) || (label === "Proposals" && isDetail) ? "page" : undefined}>{label}</Link>)}
      </nav>
      {error && needsProposals && <p className="error-text" role="alert">{error}</p>}
      {route === "/governance" && (
        <>
          <VotingRules />
          <section className="panel governance-copy">
            <h2>Proposal activity</h2>
            <p>{proposals ? `${proposals.filter((p) => p.status === "Voting open").length} open for voting · ${proposals.filter((p) => p.status === "Executed").length} executed` : "Loading proposal activity…"}</p>
            <Link className="text-link" href={base + "/proposals"}>Browse proposals <ArrowRight size={16} /></Link>
          </section>
        </>
      )}
      {route === "/governance/rules" && <VotingRules />}
      {route === "/governance/treasury" && <TreasuryView />}
      {route === "/governance/new" && <ProposalForm busy={busy} canPropose={canPropose} publish={(draft) => write("proposeRules", draft, "Your proposal transaction is confirmed.", true)} />}
      {route === "/governance/proposals" && (
        <section className="panel governance-copy">
          <div className="governance-list-heading">
            <h2>Proposals</h2>
            <label>Show <select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All proposals</option><option value="open">Open voting</option><option value="closed">Closed voting</option></select></label>
          </div>
          {!proposals && !error && <p role="status">Loading proposals…</p>}
          {displayed?.length === 0 && <p>No proposals match this filter.</p>}
          {displayed?.map((p) => (
            <Link className="governance-list-row" href={base + "/proposals/" + p.id} key={p.id}>
              <div><span className="section-note">Proposal #{p.id}</span><h3>{proposalTitle(p)}</h3></div>
              <span className="status-pill">{p.status}</span><ArrowRight size={18} aria-hidden="true" />
            </Link>
          ))}
        </section>
      )}
      {isDetail && !proposal && !error && <p role="status">{proposals ? "Proposal not found." : "Loading proposal…"}</p>}
      {proposal && (
        <article className="panel governance-copy">
          <span className="section-note">Proposal #{proposal.id}</span>
          <h2>{proposalTitle(proposal)}</h2>
          <span className="status-pill">{proposal.status}</span>
          <p className="governance-description">{proposal.description.startsWith("Title: ") ? proposal.description.split("\n").slice(1).join("\n").trim() : ""}</p>
          {proposal.terms && <Terms terms={proposal.terms} />}
          {proposal.transfer && <p>Transfer {proposal.transfer.amount} USDC to <span className="governance-address">{proposal.transfer.recipient}</span>.</p>}
          <dl className="governance-tally"><div><dt>Support</dt><dd>{proposal.yesVotes}</dd></div><div><dt>Against</dt><dd>{proposal.noVotes}</dd></div><div><dt>Eligible</dt><dd>{proposal.eligible}</dd></div></dl>
          <p>Voting deadline · {new Date(proposal.deadline * 1000).toLocaleString()}</p>
          {proposal.proposer && <p className="governance-address">Proposed by {proposal.proposer}</p>}
          <div className="governance-actions">
            {proposal.hasVoted && <span className="status-pill good">Your vote is recorded</span>}
            {proposal.canVote && <><button className="button button-lime" disabled={busy} onClick={() => void write("voteProposal", [BigInt(proposal.id), true], "Your vote in support is confirmed.")}>Vote in support</button><button className="button button-outline" disabled={busy} onClick={() => void write("voteProposal", [BigInt(proposal.id), false], "Your vote against is confirmed.")}>Vote against</button></>}
            {proposal.canExecute && <button className="button button-outline" disabled={busy} onClick={() => void write("executeProposal", [BigInt(proposal.id)], "The approved proposal is executed.", true)}>Execute approved change</button>}
          </div>
        </article>
      )}
    </>
  );
}
