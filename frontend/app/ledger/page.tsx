import Link from "next/link";
import PublicLedger from "../../components/PublicLedger";

export const metadata = { title: "Public transaction ledger" };

export default function LedgerPage() {
  return (
    <main className="workspace-content ledger-page">
      <nav className="ledger-nav" aria-label="GuardLink public pages">
        <Link className="text-link" href="/">← GuardLink</Link>
        <Link className="text-link" href="/transparency">Public case milestones</Link>
      </nav>
      <header className="ledger-heading">
        <span className="ledger-network">Arc Testnet</span>
        <h1>Public transaction ledger</h1>
        <p>Follow confirmed USDC movements in and out of the GuardLink pool. Open any transaction to check its receipt on the Arc explorer.</p>
      </header>
      <PublicLedger />
    </main>
  );
}
