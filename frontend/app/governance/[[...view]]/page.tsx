import Link from "next/link";
import Governance from "../../../components/Governance";

export const metadata = { title: "Public governance" };

export default function PublicGovernancePage() {
  return (
    <main className="workspace-content ledger-page">
      <Link className="text-link" href="/">← GuardLink</Link>
      <Governance publicView />
    </main>
  );
}
