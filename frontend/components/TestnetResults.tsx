"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { api } from "../lib/api";

type Payout = { hash: string; claimId: string; amount: string; appeal: boolean };
type Summary = { count: number; total: string; appeals: number; latest: Payout[] };
const explorer = "https://testnet.arcscan.app/tx/";
const demoLabels: Record<string, string> = {
  "0x99b9ff5721caaf32b2263f9b13d0dbaf37ce9415a3ff2d01d12d35dd4ef8fb4f": "GL-DFD3E4F9",
  "0x9740c683d839971953d61afad540597c17ffee9a144864bc85e3ea1f271c7a99": "GL-BECA3842",
  "0xd49c157356415074b0351ca974740dfb4878fca95575eb28dc79fbfa8a157f63": "GL-377CFC03",
  "0x69662d2f327881675bf2ade8560d356e88c93e59ce95f06f1452c57901fbb3b5": "Anitha Menon (fictional)",
  "0xd7e2bc7ee2d7178489df9b82d0d5588597d903b4e2fb6a7cb2a888ac8b12d8e7": "Ravi Thomas (fictional)",
};

export default function TestnetResults() {
  const [summary, setSummary] = useState<Summary>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let refreshing = false;
    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      try {
        const next = await api<Summary>("/ledger/payout-summary", {
          credentials: "omit", signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setSummary(next);
          setUnavailable(false);
        }
      } catch {
        if (!controller.signal.aborted) setUnavailable(true);
      } finally {
        refreshing = false;
      }
    }
    void refresh();
    const interval = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  return (
    <section id="results" className="results-section" aria-labelledby="results-title">
      <div className="results-intro">
        <h2 id="results-title">What we proved on testnet.</h2>
        <p>These synthetic cases use test USDC. Payout totals and receipts refresh from the Arc Testnet pool.</p>
      </div>
      <dl className="results-metrics">
        <div><dt>Claims paid</dt><dd>{summary?.count ?? "—"}</dd></div>
        <div><dt>Total paid in test USDC</dt><dd>{summary?.total ?? "—"}</dd></div>
        <div><dt>Claims paid after appeal</dt><dd>{summary?.appeals ?? "—"}</dd></div>
        <div><dt>Votes in the Mumbai coverage proposal</dt><dd>9 of 9</dd></div>
      </dl>
      {unavailable && <p role="status">{summary ? "Showing the last verified totals while Arc refreshes." : "Live payout totals are temporarily unavailable."}</p>}
      {!summary && !unavailable && <p role="status">Checking confirmed Arc payouts…</p>}
      {summary?.latest.length === 0 && <p>No confirmed payouts yet.</p>}
      {summary && summary.latest.length > 0 && (
        <ul className="results-receipts" aria-label="Latest confirmed testnet payouts">
          {summary.latest.map(({ claimId, amount, hash, appeal }) => (
            <li key={claimId}>
              <a href={`${explorer}${hash}`}>
                <span>{demoLabels[hash] ?? `Case ${claimId.slice(2, 10).toUpperCase()}`}{appeal && <small>Paid after appeal</small>}</span>
                <strong>{amount} test USDC</strong>
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="story-actions">
        <Link className="text-link" href="/ledger/?kind=payouts">View all payout receipts <ArrowUpRight size={17} aria-hidden="true" /></Link>
        <a className="text-link" href={`${explorer}0xab39a350cc31af20d2fd7954e3b6c117236eb88889f5f25ada9e3c5491479646`}>
          Verify the Mumbai coverage vote <ArrowUpRight size={17} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
