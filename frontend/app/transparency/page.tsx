import { Suspense } from "react";
import Transparency from "../../components/Transparency";
import PublicAuditNav from "../../components/PublicAuditNav";

export const metadata = { title: "Public claim timeline" };

export default function Page() {
  return (
    <main className="workspace-content ledger-page">
      <PublicAuditNav current="/transparency" />
      <Suspense fallback={<p role="status">Loading public records…</p>}>
        <Transparency allRecordsHref="/transparency" publicView />
      </Suspense>
    </main>
  );
}
