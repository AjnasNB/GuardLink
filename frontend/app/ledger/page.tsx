import { Suspense } from "react";
import PublicLedger from "../../components/PublicLedger";
import PublicAuditNav from "../../components/PublicAuditNav";

export const metadata = { title: "Public transaction ledger" };

export default function LedgerPage() {
  return (
    <main className="workspace-content ledger-page">
      <PublicAuditNav current="/ledger" />
      <header className="ledger-heading">
        <span className="ledger-network">Arc Testnet</span>
        <h1>Public transaction ledger</h1>
        <p>Follow confirmed USDC movements in and out of the GuardLink pool. Open any transaction to check its receipt on the Arc explorer.</p>
      </header>
      <Suspense fallback={<p role="status">Loading confirmed Arc transactions…</p>}>
        <PublicLedger />
      </Suspense>
    </main>
  );
}
