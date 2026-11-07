import { FileText, ExternalLink } from "lucide-react";
import { requiredDocuments, type Claim, type DocumentKind, type Evidence } from "@guardlink/domain";

export const documentLabels: Record<DocumentKind, string> = {
  bill: "Hospital bill",
  discharge_summary: "Discharge summary",
  prescription: "Prescription",
  other: "Other evidence",
};

export function evidenceLabel(document: Evidence) {
  return document.displayName || documentLabels[document.kind];
}

export default function EvidenceReview({ documents, recommendation, revision }: Pick<Claim, "documents" | "recommendation" | "revision">) {
  const present = new Set(documents.map((document) => document.kind));
  const missing = requiredDocuments.filter((kind) => !present.has(kind));
  const ready = requiredDocuments.length - missing.length;
  const analysis = recommendation?.revision === revision ? recommendation : undefined;
  const suggestedAmount = analysis?.recommendedAmount?.trim().match(/^(\d+(?:\.\d{1,6})?)(?:\s+USDC)?$/i)?.[1];
  const basis = analysis?.amountBasis;
  const reference = analysis?.pricingReference;

  return (
    <section className="panel evidence-review" aria-labelledby="evidence-review-title">
      <div className="section-row">
        <h2 id="evidence-review-title">Evidence preparation</h2>
        <span className="status-pill">{analysis?.source === "azure" ? "AI assisted" : "Document checklist"}</span>
      </div>
      <div className="evidence-readiness">
        <div><strong>{ready} of {requiredDocuments.length}</strong> required document types uploaded</div>
        <progress aria-label="Required document types uploaded" value={ready} max={requiredDocuments.length} />
        <p>{missing.length ? `Still needed: ${missing.map((kind) => documentLabels[kind]).join(", ")}.` : "All required document types are present."}</p>
      </div>
      <p className="subtle">This score measures document completeness. Jurors check the evidence and make the decision.</p>
      {analysis?.source === "azure" && (
        <div className="finding">
          <strong>{suggestedAmount ? `AI suggested reimbursement: ${suggestedAmount} test USDC` : "No AI amount suggested"}</strong>
          {basis ? (
            <p>Lowest of the hospital bill ({basis.documentedAmount} test USDC), the request ({basis.requestedAmount} test USDC), and remaining coverage ({basis.remainingCoverage} test USDC). Coverage checked {new Date(basis.checkedAt).toLocaleString()}.</p>
          ) : (
            <p>{suggestedAmount ? "Jurors confirm the evidence and may enter a different amount." : "A consistent bill amount and a verified coverage balance are needed for a suggestion. Jurors can still review the case."}</p>
          )}
          {basis && <a className="text-link evidence-reference" href={`/api/v1/evidence/${basis.evidenceId}/`} target="_blank" rel="noreferrer"><FileText size={15} /> Check the hospital bill <ExternalLink size={13} /></a>}
        </div>
      )}
      {reference && (
        <div className="finding">
          <strong>Public price reference · {reference.code}</strong>
          <p>₹{Number(reference.amountInr).toLocaleString("en-IN")} in the Kerala KASP package master dated {reference.publishedOn}. Jurors should verify that the code applies. This figure does not set the test USDC payout.</p>
          <a className="text-link evidence-reference" href={reference.sourceUrl} target="_blank" rel="noreferrer">View the State Health Agency source <ExternalLink size={13} /></a>
        </div>
      )}
      <details className="evidence-findings">
        <summary>{analysis?.source === "azure" ? `Review AI findings (${analysis.findings.length})` : "Review evidence details"}</summary>
        {!analysis ? <p>{recommendation ? "The documents changed. Run evidence preparation again for an updated review." : "Run evidence preparation to check the documents."}</p> : (
          <>
            <p>{analysis.summary}</p>
            {analysis.findings.map((finding, index) => {
              const references = documents.filter((document) => finding.evidenceIds.includes(document.id));
              return (
                <div className="finding" key={`${finding.code}-${index}`}>
                  <strong>{finding.code.replaceAll("_", " ")}</strong>
                  <p>{finding.message}</p>
                  {references.map((document) => (
                    <a className="text-link evidence-reference" key={document.id} href={`/api/v1/evidence/${document.id}/`} target="_blank" rel="noreferrer">
                      <FileText size={15} /> {evidenceLabel(document)} <ExternalLink size={13} />
                    </a>
                  ))}
                </div>
              );
            })}
          </>
        )}
      </details>
    </section>
  );
}
