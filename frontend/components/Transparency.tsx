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
}: {
  allRecordsHref?: string;
  challengePool?: string;
}) {
  const caseId = useSearchParams().get("caseId");
  const [records, setRecords] = useState<
      {
        id: string;
        kind: string;
        public_data: string;
        created_at: string;
        arkiv_key: string | null;
      }[]
    >([]),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    api<typeof records>(
      caseId
        ? `/transparency?caseId=${encodeURIComponent(caseId)}`
        : "/transparency",
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
  }, [caseId]);
  return (
    <>
      <PageHeading
        title="A fund you can follow."
        description="Public process records. Private medical evidence. A distinction that matters."
        action={<Link className="button button-outline" href="/ledger">View public transaction ledger <ExternalLink size={16} /></Link>}
      />
      {caseId && (
        <div className="inline-note">
          <span>
            Public milestones for case {caseId.slice(0, 8).toUpperCase()}.
          </span>
          <Link href={allRecordsHref}>Show all records</Link>
        </div>
      )}
      {caseId && challengePool && <PayoutChallenge key={caseId} caseId={caseId} pool={challengePool} />}
      <div className="search-field">
        <Search size={18} />
        <input
          aria-label="Search public records"
          placeholder="Search a case ID or event"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {loading && <p role="status">Loading public records…</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <section className="panel">
        {!loading && !error && records
          .filter((r) =>
            `${r.kind} ${r.public_data}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((r) => {
            const data = JSON.parse(r.public_data) as {
              claimId?: string;
              coverageLimit?: string;
              contribution?: string;
              termDays?: number;
              proposalId?: string;
              yesVotes?: string;
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
                        ? `Proposal #${data.proposalId} · ${data.yesVotes}/${data.eligible} in support`
                        : data.claimId && !caseId
                          ? <Link href={`${allRecordsHref}?caseId=${encodeURIComponent(data.claimId)}`}>{data.claimId}</Link>
                          : (data.claimId ?? "Community record")}
                  </small>
                </div>
                <time>{new Date(r.created_at).toLocaleString()}</time>
                {r.arkiv_key && (
                  <span className="status-pill good">Published</span>
                )}
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
        {!loading && !error && !records.length && (
          <div className="empty-state compact">
            <Globe />
            <h3>The record starts with your community.</h3>
            <p>
              Confirmed contributions, case milestones and governance events
              will appear here.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
