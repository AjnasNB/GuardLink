"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Globe, Search } from "lucide-react";
import { api } from "../lib/api";
import { PageHeading } from "./WorkspaceParts";
import PayoutChallenge from "./PayoutChallenge";

export default function Transparency({
  allRecordsHref = "/app/transparency",
  challengePool,
  publicView = false,
}: {
  allRecordsHref?: string;
  challengePool?: string;
  publicView?: boolean;
}) {
  const caseId = useSearchParams().get("caseId");
  const [records, setRecords] = useState<
      {
        id: string;
        kind: string;
        public_data: string;
        created_at: string;
        arkiv_key: string | null;
        owner?: string;
        payloadHash?: string;
        swarmReference?: string | null;
        chainClaimId?: string;
        voteCount?: number | null;
        appealVoteCount?: number | null;
      }[]
    >([]),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [paging, setPaging] = useState({ caseId, offset: 0 });
  const offset = paging.caseId === caseId ? paging.offset : 0;
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ offset: String(offset) });
    if (caseId) params.set("caseId", caseId);
    api<typeof records>(
      `/transparency?${params}`,
      { signal: request.signal, credentials: "omit" },
    )
      .then((rows) => {
        if (request.signal.aborted) return;
        setRecords(
          [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)),
        );
      })
      .catch((e) => {
        if (!request.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [caseId, offset]);
  const chainClaimId = records[0]?.chainClaimId;
  const visible = records.filter((record) =>
    `${record.kind} ${record.public_data} ${record.arkiv_key ?? ""} ${record.payloadHash ?? ""}`
      .toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <PageHeading
        title={publicView ? "Arkiv public archive" : "A fund you can follow."}
        description={publicView ? "Search claim milestones and governance records. Each published record has an Arkiv key and a payload hash." : "Public process records. Private medical evidence."}
        action={<Link className="button button-outline" href="/ledger">View public transaction ledger <ExternalLink size={16} /></Link>}
      />
      {caseId && (
        <div className="inline-note">
          <span>
            Public milestones for case {caseId.slice(0, 8).toUpperCase()}.
          </span>
          <Link href={allRecordsHref}>Show all records</Link>
          {!loading && chainClaimId && <span>{records[0].voteCount ?? 0} initial ballots · {records[0].appealVoteCount ?? 0} appeal ballots synced</span>}
          {chainClaimId && <Link href={`/ledger/votes?kind=jury-votes&claim=${encodeURIComponent(chainClaimId)}`}>Verify jury ballots on Arc</Link>}
        </div>
      )}
      {caseId && challengePool && <PayoutChallenge key={caseId} caseId={caseId} pool={challengePool} />}
      <div className="search-field">
        <Search size={18} />
        <input
          aria-label="Search public records"
          placeholder="Search by case, event or hash"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {loading && <p role="status">Loading public records…</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <section className={publicView ? "ledger-results audit-records" : "panel"} aria-label="Public archive records" aria-busy={loading}>
        {publicView && !loading && !error && <div className="ledger-toolbar"><span>{visible.length} records shown</span><span>Active Arkiv Rabdi records</span></div>}
        {!loading && !error && visible.map((r) => {
            const data = JSON.parse(r.public_data) as {
              claimId?: string;
              coverageLimit?: string;
              contribution?: string;
              termDays?: number;
              proposalId?: string;
              yesVotes?: string;
              noVotes?: string;
              eligible?: string;
              transactionHash?: string;
            };
            return (
              <div className="record-row" key={r.id}>
                <span className="record-dot" />
                <div>
                  <strong>{r.kind.replaceAll("_", " ")}</strong>
                  <small>
                    {data.coverageLimit
                      ? `${data.contribution} USDC contribution · ${data.coverageLimit} USDC limit · ${data.termDays} days`
                      : data.proposalId
                        ? <Link href={`/governance/proposals/${data.proposalId}`}>Proposal #{data.proposalId} · {data.yesVotes} support · {data.noVotes} against · {data.eligible} eligible</Link>
                        : data.claimId && !caseId
                          ? <Link href={`${allRecordsHref}?caseId=${encodeURIComponent(data.claimId)}`}>{data.claimId}</Link>
                          : (data.claimId ?? "Community record")}
                  </small>
                </div>
                <time>{new Date(r.created_at).toLocaleString()}</time>
                {r.arkiv_key && (publicView ? (
                  <details className="audit-proof">
                    <summary>Arkiv proof</summary>
                    <dl>
                      <dt>Entity key</dt><dd><code>{r.arkiv_key}</code></dd>
                      {r.owner && <><dt>Publisher</dt><dd><code>{r.owner}</code></dd></>}
                      {r.payloadHash && <><dt>Public payload SHA-256</dt><dd><code>{r.payloadHash}</code></dd></>}
                      {r.swarmReference && <><dt>Swarm ciphertext reference</dt><dd><code>{r.swarmReference}</code></dd></>}
                    </dl>
                    <a className="text-link" href="https://docs.arkiv.network/querying/get-entity/" target="_blank" rel="noreferrer">Verify with the entity key <ExternalLink size={14} /></a>
                  </details>
                ) : (
                  <span className="status-pill good">Published</span>
                ))}
                {data.transactionHash &&
                  /^0x[0-9a-fA-F]{64}$/.test(data.transactionHash) && (
                    <a
                      className="text-link"
                      href={`https://testnet.arcscan.app/tx/${data.transactionHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Receipt <ExternalLink size={14} />
                    </a>
                  )}
              </div>
            );
          })}
        {!loading && !error && !visible.length && (
          <div className="empty-state compact">
            <Globe />
            <h3>{query ? "No records match your search." : "No archive records available."}</h3>
            <p>{query ? "Try a different case ID, event, or hash." : "Confirmed transactions remain available in the Arc ledger."}</p>
          </div>
        )}
        {!loading && !error && (offset > 0 || records.length === 100) && (
          <div className="ledger-pagination" role="group" aria-label="Archive pages">
            <button className="button button-outline" disabled={offset === 0} onClick={() => setPaging({ caseId, offset: offset - 100 })}>Previous page</button>
            <button className="button button-outline" disabled={records.length < 100 || offset >= 999900} onClick={() => setPaging({ caseId, offset: offset + 100 })}>Next page</button>
          </div>
        )}
      </section>
    </>
  );
}
