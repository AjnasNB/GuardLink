import Link from "next/link";
import PublicLedger from "../../components/PublicLedger";
import { PageHeading } from "../../components/WorkspaceParts";

export const metadata = { title: "Public transaction ledger" };

export default function LedgerPage() {
  return (
    <main className="workspace-content ledger-page">
      <div className="header-actions ledger-actions">
        <Link className="text-link" href="/">← GuardLink</Link>
        <Link className="text-link" href="/transparency">Public case milestones</Link>
      </div>
      <PageHeading title="Public transaction ledger" description="Follow confirmed contributions, claim payouts and treasury transfers from the cooperative pool. Each entry links to its Arc receipt." />
      <PublicLedger />
    </main>
  );
}
