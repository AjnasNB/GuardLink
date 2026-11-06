"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api, short } from "../lib/api";

const views = [
  { value: "contributions", label: "Contributions" },
  { value: "payouts", label: "Claim payouts" },
  { value: "treasury", label: "Treasury transfers" },
] as const;
type Kind = typeof views[number]["value"];
type LedgerPage = {
  pool: string;
  entries: { block: number; time: string; hash: string; index: number; wallet: string; amount: string; reference: string }[];
  next: string | null;
};
const explorer = "https://testnet.arcscan.app";
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" });

export default function PublicLedger() {
  const [view, setView] = useState<{ kind: Kind; cursors: string[] }>({ kind: "contributions", cursors: [] });
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ view: typeof view; retry: number; page?: LedgerPage; error?: string }>();
  const current = result?.view === view && result.retry === retry ? result : undefined;
  const page = current?.page;
  useEffect(() => {
    const request = new AbortController();
    const query = new URLSearchParams({ kind: view.kind });
    const before = view.cursors.at(-1);
    if (before) query.set("before", before);
    api<LedgerPage>(`/ledger?${query}`, { credentials: "omit", signal: request.signal })
      .then((data) => {
        if (!request.signal.aborted) setResult({ view, retry, page: data });
      })
      .catch((error: unknown) => {
        if (!request.signal.aborted) setResult({ view, retry, error: error instanceof Error ? error.message : "Could not load the ledger." });
      });
    return () => request.abort();
  }, [view, retry]);

  return (
    <>
      <div className="header-actions ledger-actions" aria-label="Transaction type">
        {views.map(({ value, label }) => (
          <button key={value} className={`button ${view.kind === value ? "button-lime" : "button-outline"}`}
            aria-pressed={view.kind === value} onClick={() => setView({ kind: value, cursors: [] })}>
            {label}
          </button>
        ))}
      </div>
      {!current && <p role="status">Loading confirmed Arc transactions…</p>}
      {current?.error && (
        <div className="inline-note" role="alert">
          <span>{current.error}</span><button className="button button-outline" onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </div>
      )}
      {page && (
        <>
          <div className="inline-note">
            <span>Arc Testnet · Amounts in test USDC · Timestamps in UTC</span>
            <a className="text-link" href={`${explorer}/address/${page.pool}`} target="_blank" rel="noreferrer">Pool on ArcScan <ExternalLink size={14} /></a>
          </div>
          {page.entries.length ? (
            <div className="table-wrap">
              <table className="claims-table" aria-label="Confirmed Arc pool transactions">
                <thead><tr><th scope="col">Time (UTC)</th><th scope="col">Record</th><th scope="col">Amount</th><th scope="col">{view.kind === "contributions" ? "From wallet" : "To wallet"}</th><th scope="col">Block</th><th scope="col">Receipt</th></tr></thead>
                <tbody>
                  {page.entries.map((row) => (
                    <tr key={`${row.hash}:${row.index}`}>
                      <td><time dateTime={row.time}>{date.format(new Date(row.time))}</time></td>
                      <td>{row.reference}</td>
                      <td>{row.amount} USDC</td>
                      <td><a href={`${explorer}/address/${row.wallet}`} target="_blank" rel="noreferrer" title={row.wallet} aria-label={`Wallet ${row.wallet}`}>{short(row.wallet)}</a></td>
                      <td>{row.block}</td>
                      <td><a className="text-link" href={`${explorer}/tx/${row.hash}`} target="_blank" rel="noreferrer" title={row.hash} aria-label={`ArcScan receipt ${row.hash}`}>{short(row.hash)} <ExternalLink size={14} /></a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty-state compact">No confirmed transactions in this view.</p>}
          {(page.next || view.cursors.length > 0) && (
            <div className="header-actions ledger-actions" aria-label="Ledger pages">
              <button className="button button-outline" disabled={!view.cursors.length} onClick={() => setView({ ...view, cursors: view.cursors.slice(0, -1) })}>Newer</button>
              <button className="button button-outline" disabled={!page.next} onClick={() => { if (page.next) setView({ ...view, cursors: [...view.cursors, page.next] }); }}>Older</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
