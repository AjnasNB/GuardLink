import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import type { Claim } from "@guardlink/domain";
import { money } from "../lib/api";
const statusText: Record<string, string> = {
  submitted: "Submitted",
  awaiting_jury: "Awaiting jury assignment",
  unresolved: "Review unresolved",
  analyzing: "Preparing your case",
  needs_documents: "Action needed",
  ready_for_review: "Ready for review",
  under_review: "Jury reviewing",
  approved: "Approved",
  rejected: "Not approved",
  awaiting_funds: "Awaiting funds",
  payment_pending: "Payment pending",
  paid: "Paid",
  appealed: "Appeal in review",
};
export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="section-note">GuardLink / Community protection</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function ClaimList({ claims }: { claims: Claim[] }) {
  return claims.length ? (
    <div className="table-wrap">
      <table className="claims-table" aria-label="Claims" role="table">
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">Case</th>
            <th scope="col" role="columnheader">Requested</th>
            <th scope="col" role="columnheader">Status</th>
            <th scope="col" role="columnheader">Evidence</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {claims.map((claim) => (
            <tr key={claim.id} role="row">
              <td className="claim-case" role="cell">
                <Link href={`/app/claims/${claim.id}`} className="claim-row-link">
                  <span>
                    <strong>{claim.title}</strong>
                    <small>GL-{claim.id.slice(0, 8).toUpperCase()}</small>
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </td>
              <td className="claim-amount" role="cell">
                <span className="claim-field-label" aria-hidden="true">Requested</span>
                {money(claim.requestedAmount)} USDC
              </td>
              <td className="claim-status" role="cell">
                <span className="claim-field-label" aria-hidden="true">Status</span>
                <Status status={claim.status} />
              </td>
              <td className="claim-evidence" role="cell">
                <span className="claim-field-label" aria-hidden="true">Evidence</span>
                {claim.documents.length} {claim.documents.length === 1 ? "document" : "documents"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="empty-state">
      <span className="empty-icon">
        <FileText size={25} />
      </span>
      <h3>No cases to follow yet.</h3>
      <p>
        When you submit a claim or receive a review assignment, it will appear
        here with a clear next step.
      </p>
    </div>
  );
}
export function Status({ status }: { status: string }) {
  return (
    <span
      className={`status-pill ${status === "paid" || status === "approved" ? "good" : status === "needs_documents" ? "attention" : ""}`}
    >
      <span className="status-dot" />
      {statusText[status] ?? status}
    </span>
  );
}
