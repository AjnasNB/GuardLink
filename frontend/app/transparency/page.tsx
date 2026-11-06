import { Suspense } from "react";
import Link from "next/link";
import Transparency from "../../components/Transparency";

export const metadata = { title: "Public claim timeline" };

export default function Page() {
  return (
    <main className="workspace-content">
      <Link className="text-link mb-8" href="/#progress">← GuardLink</Link>
      <Suspense fallback={<p role="status">Loading public records…</p>}>
        <Transparency allRecordsHref="/transparency" />
      </Suspense>
    </main>
  );
}
