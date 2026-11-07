import { Suspense } from "react";
import PublicLedger from "../../../components/PublicLedger";
import PublicAuditNav from "../../../components/PublicAuditNav";

export const metadata = { title: "Public votes and decisions" };

export default function VotesPage() {
  return (
    <main className="workspace-content ledger-page">
      <PublicAuditNav current="/ledger/votes" />
      <header className="ledger-heading">
        <span className="ledger-network">Arc Testnet</span>
        <h1>Public votes and decisions</h1>
        <p>Follow cooperative votes, jury ballots, and the transactions that resolved them.</p>
      </header>
      <Suspense fallback={<p role="status">Loading public votes…</p>}>
        <PublicLedger voting />
      </Suspense>
    </main>
  );
}
