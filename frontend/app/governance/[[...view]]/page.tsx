import Governance from "../../../components/Governance";
import PublicAuditNav from "../../../components/PublicAuditNav";

export const metadata = { title: "Public governance" };

export default function PublicGovernancePage() {
  return (
    <main className="workspace-content ledger-page">
      <PublicAuditNav current="/governance/proposals" />
      <Governance publicView />
    </main>
  );
}
