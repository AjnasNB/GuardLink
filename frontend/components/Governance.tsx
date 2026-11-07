"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { usePathname } from "next/navigation";
import { formatUnits, isAddress, parseUnits, zeroAddress, type Address } from "viem";
import { api, type Config, type Member } from "../lib/api";
import { poolWrite } from "../lib/contracts";
import { PageHeading } from "./WorkspaceParts";

const pages = [
  ["Overview", ""],
  ["Proposals", "/proposals"],
  ["Treasury", "/treasury"],
  ["Voting rules", "/rules"],
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
  creationHash: string | null;
  terms: { contribution: string; limit: string; days: number } | null;
  transfer: { recipient: string; amount: string } | null;
};
type Treasury = { available: string; committed: string; exposure: string };
type Run = (fn: () => Promise<unknown>, message?: string) => Promise<void>;
type Draft = { kind: "rules"; args: [bigint, bigint, number, string] }
  | { kind: "transfer"; args: [Address, bigint, string] };

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
      <Link className="text-link" href="/ledger?kind=treasury">View public treasury transactions <ArrowRight size={16} /></Link>
    </section>
  );
}

function ProposalForm({ canPropose, busy, poolAddress, publish }: {
  canPropose: boolean;
  busy: boolean;
  poolAddress?: string;
  publish?: (draft: Draft) => Promise<void>;
}) {
  const [kind, setKind] = useState<Draft["kind"]>("rules");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  function preview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const sections = [["Title", "title"], ["Summary", "summary"], ["Why this matters", "rationale"], ["Timing and impact", "impact"], ["Conflicts of interest", "conflicts"]];
    const description = sections.map(([label, name]) => label + ": " + String(form.get(name)).trim()).join("\n\n");
    if (kind === "transfer") {
      const recipient = String(form.get("recipient")).trim();
      if (!isAddress(recipient) || recipient === zeroAddress || recipient.toLowerCase() === poolAddress?.toLowerCase()) {
        setError("Enter a valid Arc wallet address outside the pool.");
        return;
      }
      setDraft({ kind, args: [recipient, parseUnits(String(form.get("amount")), 6), description] });
    } else {
      setDraft({ kind, args: [parseUnits(String(form.get("contribution")), 6), parseUnits(String(form.get("limit")), 6), Number(form.get("days")), description] });
    }
  }
  if (!canPropose) return <p className="panel">Connect a verified member wallet to propose a change.</p>;
  return (
    <section className="panel form-stack governance-copy">
      <h2>Make a community proposal</h2>
      <p>Explain the change members will vote on. Proposal text is public. Keep personal and medical information out of it.</p>
      {!publish && <p>Preview either proposal form here. Verified members publish from the member workspace.</p>}
      <form className="form-stack" onSubmit={preview} hidden={Boolean(draft)}>
        <label>Proposal type<select value={kind} onChange={(e) => { setKind(e.target.value === "transfer" ? "transfer" : "rules"); setError(""); }}>
          <option value="rules">Future coverage terms</option>
          <option value="transfer">One-time treasury transfer</option>
        </select></label>
        <label>Proposal title<input name="title" required minLength={4} maxLength={80} /></label>
        <label>Summary<textarea name="summary" required rows={2} maxLength={240} /></label>
        <label>Why this matters<textarea name="rationale" required rows={3} maxLength={300} /></label>
        <label>Timing and impact<textarea name="impact" required rows={2} maxLength={240} placeholder="Who benefits, and when should the new terms take effect?" /></label>
        <label>Conflicts of interest<input name="conflicts" required maxLength={110} placeholder="Enter None if there are no conflicts" /></label>
        {kind === "rules" ? <div className="form-columns">
          <label>Contribution (USDC)<input name="contribution" type="number" min="0.000001" step="0.000001" required /></label>
          <label>Coverage limit (USDC)<input name="limit" type="number" min="0.000001" step="0.000001" required /></label>
          <label>Term (days)<input name="days" type="number" min="1" max="365" required /></label>
        </div> : <>
          <p>A transfer can use up to 10% of the free treasury. Members must approve it before any funds move.</p>
          <div className="form-columns">
            <label>Recipient wallet<input name="recipient" required maxLength={42} autoComplete="off" spellCheck={false} /></label>
            <label>Transfer amount (USDC)<input name="amount" type="number" min="0.000001" step="0.000001" required /></label>
          </div>
        </>}
        {error && <p className="error-text" role="alert">{error}</p>}
        <button className="button button-lime">Review proposal <ArrowRight size={17} /></button>
      </form>
      {draft && (
        <div className="form-stack">
          <h3>{publish ? "Review before signing" : "Proposal preview"}</h3>
          <p className="governance-description">{draft.args.at(-1)}</p>
          {draft.kind === "rules"
            ? <Terms terms={{ contribution: formatUnits(draft.args[0], 6), limit: formatUnits(draft.args[1], 6), days: draft.args[2] }} />
            : <p className="governance-address">Transfer {formatUnits(draft.args[1], 6)} USDC to {draft.args[0]}.</p>}
          <div className="governance-actions">
            <button className="button button-outline" disabled={busy} onClick={() => setDraft(null)}>Edit draft</button>
            {publish
              ? <button className="button button-lime" disabled={busy} onClick={() => void publish(draft)}>Sign and publish</button>
              : <Link className="button button-lime" href="/app/governance/new">Open member proposal form</Link>}
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

function VoteTally({ proposal }: { proposal: Proposal }) {
  const support = BigInt(proposal.yesVotes), against = BigInt(proposal.noVotes);
  const eligible = BigInt(proposal.eligible), cast = support + against;
  const quorum = (eligible + 1n) / 2n;
  const percent = (part: bigint, total: bigint) => total ? Number(part * 100n / total) : 0;
  return (
    <div className="vote-results">
      <div>
        <h3>Vote results</h3>
        <div className="vote-result-label"><span>Support</span><strong>{proposal.yesVotes}</strong></div>
        <progress className="support-meter" max={100} value={percent(support, cast)} aria-label="Share of votes in support" />
        <div className="vote-result-label"><span>Against</span><strong>{proposal.noVotes}</strong></div>
        <progress max={100} value={percent(against, cast)} aria-label="Share of votes against" />
      </div>
      <div>
        <h3>Requirements</h3>
        <p><strong>{cast.toString()} of {proposal.eligible}</strong> eligible members voted.</p>
        <p>{cast >= quorum ? "Quorum reached" : "Quorum pending"} · {quorum.toString()} votes required</p>
        <p>{percent(support, cast)}% support · at least two-thirds required</p>
      </div>
    </div>
  );
}

export default function Governance({ config, member, busy = false, run, route: memberRoute, publicView = false }: {
  config?: Config | null;
  member?: Member | null;
  busy?: boolean;
  run?: Run;
  route?: string;
  publicView?: boolean;
}) {
  const pathname = usePathname();
  const route = memberRoute ?? pathname.replace(/\/$/, "");
  const base = publicView ? "/governance" : "/app/governance";
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [ballot, setBallot] = useState<{ proposal: string; support: boolean } | null>(null);
  const isDetail = route.startsWith("/governance/proposals/");
  const proposal = isDetail ? proposals?.find((p) => p.id === route.split("/").at(-1)) : undefined;
  const canPropose = Boolean(config?.poolAddress && member?.wallet && member?.verified);
  const needsProposals = route === "/governance" || route === "/governance/proposals" || isDetail;
  const load = useCallback(async () => {
    try {
      setProposals(await api<Proposal[]>(publicView ? "/governance/public" : "/governance", publicView ? { credentials: "omit" } : {}));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load proposals.");
    }
  }, [publicView]);
  useEffect(() => {
    if (!needsProposals) return;
    void load();
    const timer = setInterval(() => void load(), 12000);
    return () => clearInterval(timer);
  }, [load, needsProposals]);
  async function write(name: string, args: readonly unknown[], message: string, sync = false) {
    if (!run) return;
    await run(async () => {
      const txHash = await poolWrite(config?.poolAddress ?? "", name, args);
      if (sync) await api("/governance/sync", { method: "POST", body: JSON.stringify({ txHash }) });
    }, message);
    if (needsProposals) await load();
  }
  const displayed = proposals?.filter((p) => filter === "all" || (filter === "open" ? p.status === "Voting open" : p.status !== "Voting open"));
  return (
    <>
      <PageHeading title="Community governance" description={publicView ? "Browse cooperative proposals, vote counts and confirmed results." : "Review proposals and vote on how your cooperative operates."} action={canPropose && route !== "/governance/new" ? (
        <Link className="button button-lime" href={base + "/new"}>New proposal <ArrowRight size={17} /></Link>
      ) : publicView ? <Link className="button button-outline" href="/app/governance">Open member voting <ArrowRight size={16} /></Link> : undefined} />
      <nav aria-label="Governance pages" className="governance-nav">
        {pages.filter(([label]) => !publicView || label !== "Treasury").map(([label, suffix]) => <Link key={suffix} href={base + suffix} aria-current={route === "/governance" + suffix || (label === "Proposals" && isDetail) ? "page" : undefined}>{label}</Link>)}
        {!publicView && <Link href="/governance/proposals">Public proposals <ExternalLink size={14} /></Link>}
        {publicView && <Link href={base + "/new"} aria-current={route === "/governance/new" ? "page" : undefined}>Proposal forms</Link>}
        {!publicView && <Link href="/ledger">Public ledger <ExternalLink size={14} /></Link>}
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
      {route === "/governance/treasury" && !publicView && <TreasuryView />}
      {route === "/governance/new" && !publicView && <ProposalForm busy={busy} canPropose={canPropose} poolAddress={config?.poolAddress}
        publish={(draft) => write(draft.kind === "rules" ? "proposeRules" : "proposeTreasuryTransfer", draft.args, "Your proposal transaction is confirmed.", true)} />}
      {route === "/governance/new" && publicView && <ProposalForm busy={false} canPropose />}
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
              <div><span className="section-note">Proposal #{p.id}</span><h3>{proposalTitle(p)}</h3><small>{p.yesVotes} support · {p.noVotes} against · {p.eligible} eligible</small></div>
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
          <VoteTally proposal={proposal} />
          <p>Voting deadline · {new Date(proposal.deadline * 1000).toLocaleString()}</p>
          {proposal.proposer && <p className="governance-address">Proposed by {proposal.proposer}</p>}
          {proposal.creationHash && <a className="text-link" href={"https://testnet.arcscan.app/tx/" + proposal.creationHash} target="_blank" rel="noreferrer">Proposal creation receipt <ExternalLink size={15} /></a>}
          <div className="governance-actions">
            <Link className="text-link" href={`/ledger/votes?kind=proposal-votes&proposal=${proposal.id}`}>Verify individual votes <ArrowRight size={15} /></Link>
            {proposal.status === "Executed" && <Link className="text-link" href={`/ledger/votes?kind=executions&proposal=${proposal.id}`}>Verify execution <ArrowRight size={15} /></Link>}
          </div>
          {!publicView && <Link className="text-link" href={"/governance/proposals/" + proposal.id}>Share public proposal <ArrowRight size={15} /></Link>}
          <div className="governance-actions">
            {proposal.hasVoted && <span className="status-pill good">Your vote is recorded</span>}
            {proposal.canVote && ballot?.proposal !== proposal.id && <><button className="button button-lime" disabled={busy} onClick={() => setBallot({ proposal: proposal.id, support: true })}>Vote in support</button><button className="button button-outline" disabled={busy} onClick={() => setBallot({ proposal: proposal.id, support: false })}>Vote against</button></>}
            {proposal.canExecute && <button className="button button-outline" disabled={busy} onClick={() => void write("executeProposal", [BigInt(proposal.id)], "The approved proposal is executed.", true)}>Execute approved change</button>}
          </div>
          {proposal.canVote && ballot?.proposal === proposal.id && (
            <div className="inline-note">
              <span>You selected <strong>{ballot.support ? "Support" : "Against"}</strong> for proposal #{proposal.id}.</span>
              <button className="button button-outline" disabled={busy} onClick={() => setBallot(null)}>Change vote choice</button>
              <button className="button button-lime" disabled={busy} onClick={() => void write("voteProposal", [BigInt(proposal.id), ballot.support], "Your vote is confirmed on Arc.")}>Sign vote</button>
            </div>
          )}
        </article>
      )}
    </>
  );
}
