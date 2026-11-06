"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Box, CheckCircle2, ExternalLink, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
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
const explorer = "https://explorer.testnet.arc.io";
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" });

function explorerPath(input: string) {
  if (/^0x[\da-f]{64}$/i.test(input)) return `/tx/${input}`;
  if (/^0x[\da-f]{40}$/i.test(input)) return `/address/${input}`;
  if (/^\d{1,15}$/.test(input)) return `/block/${input}`;
}

export default function PublicLedger() {
  const requested = useSearchParams().get("kind");
  const kind = views.find((view) => view.value === requested)?.value ?? "contributions";
  return <LedgerView key={kind} initialKind={kind} />;
}

function LedgerView({ initialKind }: { initialKind: Kind }) {
  const [view, setView] = useState<{ kind: Kind; cursors: string[] }>({ kind: initialKind, cursors: [] });
  const [retry, setRetry] = useState(0);
  const [searchError, setSearchError] = useState(false);
  const [result, setResult] = useState<{ view: typeof view; retry: number; page?: LedgerPage; error?: string }>();
  const current = result?.view === view && result.retry === retry ? result : undefined;
  const page = current?.page;
  const poolAddress = page?.pool ?? result?.page?.pool;
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

  function searchExplorer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = String(new FormData(event.currentTarget).get("lookup") ?? "").trim();
    const path = explorerPath(input);
    if (path) window.location.assign(explorer + path);
    else setSearchError(true);
  }

  return (
    <>
      <form className="ledger-search" role="search" aria-label="Arc Testnet lookup" onSubmit={searchExplorer}>
        <Search size={18} aria-hidden="true" />
        <input name="lookup" type="search" autoComplete="off" spellCheck={false}
          aria-label="Transaction hash, wallet address or block number"
          aria-invalid={searchError} aria-describedby={searchError ? "ledger-search-error" : undefined}
          placeholder="Search by transaction hash, wallet address or block"
          onChange={() => setSearchError(false)} />
        <button type="submit">Search <span>Arc</span></button>
      </form>
      {searchError && <p className="ledger-search-error" id="ledger-search-error" role="alert">Enter a full transaction hash, wallet address, or block number.</p>}
      {poolAddress && (
        <div className="ledger-pool">
          <Box size={18} aria-hidden="true" />
          <div>
            <strong>GuardLinkPool</strong>
            <a href={`${explorer}/address/${poolAddress}`} target="_blank" rel="noreferrer" aria-label={`Pool contract ${poolAddress} on Arc explorer`}>{poolAddress} <ExternalLink size={14} aria-hidden="true" /></a>
          </div>
        </div>
      )}
      <div className="ledger-tabs" role="group" aria-label="Transaction type">
        {views.map(({ value, label }) => (
          <button key={value} type="button" aria-pressed={view.kind === value}
            onClick={() => { if (view.kind !== value) setView({ kind: value, cursors: [] }); }}>
            {label}
          </button>
        ))}
      </div>
      <section className="ledger-results" aria-label="Transaction results" aria-busy={!current}>
        <div className="ledger-toolbar">
          <span><CheckCircle2 size={15} aria-hidden="true" /> Confirmed events</span>
          <span>Test USDC · UTC</span>
        </div>
        {!current && <p className="ledger-message" role="status">Loading confirmed Arc transactions…</p>}
        {current?.error && (
          <div className="ledger-message" role="alert">
            <p>{current.error}</p><button className="button button-outline" onClick={() => setRetry((n) => n + 1)}>Retry</button>
          </div>
        )}
        {page && (
          <>
            {page.entries.length ? (
              <div className="ledger-table-wrap" tabIndex={0} role="region" aria-label="Scrollable transaction table">
                <table className="ledger-table" aria-label="Confirmed Arc pool transactions">
                  <thead>
                    <tr><th scope="col">Txn hash</th><th scope="col">Event</th><th scope="col">Block</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Value</th></tr>
                  </thead>
                  <tbody>
                    {page.entries.map((row) => {
                      const incoming = view.kind === "contributions";
                      const pool = <a href={`${explorer}/address/${page.pool}`} target="_blank" rel="noreferrer" title={page.pool}>GuardLinkPool</a>;
                      const wallet = <a href={`${explorer}/address/${row.wallet}`} target="_blank" rel="noreferrer" title={row.wallet} aria-label={`Wallet ${row.wallet}`}>{short(row.wallet)}</a>;
                      return (
                        <tr key={`${row.hash}:${row.index}`}>
                          <td>
                            <a className="ledger-hash" href={`${explorer}/tx/${row.hash}`} target="_blank" rel="noreferrer" title={row.hash} aria-label={`Arc receipt ${row.hash}`}>{row.hash.slice(0, 12)}…{row.hash.slice(-4)} <ExternalLink size={13} aria-hidden="true" /></a>
                            <time dateTime={row.time}>{date.format(new Date(row.time))}</time>
                          </td>
                          <td><span className="ledger-event">{incoming ? "Contribution" : view.kind === "payouts" ? "Claim payout" : "Treasury transfer"}</span>{view.kind !== "payouts" && <small>{row.reference}</small>}</td>
                          <td><a href={`${explorer}/block/${row.block}`} target="_blank" rel="noreferrer">{row.block}</a></td>
                          <td>{incoming ? wallet : pool}</td>
                          <td><span className="ledger-recipient"><ArrowRight size={16} className={incoming ? "ledger-in" : "ledger-out"} aria-hidden="true" />{incoming ? pool : wallet}</span></td>
                          <td><strong>{row.amount}</strong> <span className="ledger-unit">USDC</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="ledger-message" role="status">No confirmed transactions in this view.</p>}
            {(page.next || view.cursors.length > 0) && (
              <div className="ledger-pagination" role="group" aria-label="Ledger pages">
                <button className="button button-outline" disabled={!view.cursors.length} onClick={() => setView({ ...view, cursors: view.cursors.slice(0, -1) })}>Newer</button>
                <button className="button button-outline" disabled={!page.next} onClick={() => { if (page.next) setView({ ...view, cursors: [...view.cursors, page.next] }); }}>Older</button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
