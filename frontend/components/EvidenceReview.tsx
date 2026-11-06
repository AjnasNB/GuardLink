import { FileText, ExternalLink } from "lucide-react";
import { requiredDocuments, type Claim, type DocumentKind } from "@guardlink/domain";

const labels: Record<DocumentKind, string> = {
  bill: "Hospital bill",
  discharge_summary: "Discharge summary",
  prescription: "Prescription",
  other: "Other evidence",
};

export default function EvidenceReview({ documents, recommendation, revision }: Pick<Claim, "documents" | "recommendation" | "revision">) {
  const present = new Set(documents.map((document) => document.kind));
  const missing = requiredDocuments.filter((kind) => !present.has(kind));
  const ready = requiredDocuments.length - missing.length;
  const analysis = recommendation?.revision === revision ? recommendation : undefined;
  const suggestedAmount = analysis?.recommendedAmount?.trim().match(/^(\d+(?:\.\d{1,6})?)(?:\s+USDC)?$/i)?.[1];

  return (
    <section className="panel evidence-review" aria-labelledby="evidence-review-title">
      <div className="section-row">
        <h2 id="evidence-review-title">Evidence preparation</h2>
        <span className="status-pill">{analysis?.source === "azure" ? "AI assisted" : "Document checklist"}</span>
      </div>
      <div className="evidence-readiness">
        <div><strong>{ready} of {requiredDocuments.length}</strong> required document types uploaded</div>
        <progress aria-label="Required document types uploaded" value={ready} max={requiredDocuments.length} />
        <p>{missing.length ? `Still needed: ${missing.map((kind) => labels[kind]).join(", ")}.` : "All required document types are present."}</p>
      </div>
      <p className="subtle">This score measures document completeness. Jurors check the evidence and make the decision.</p>
      <details className="evidence-findings">
        <summary>{analysis?.source === "azure" ? `Review AI findings (${analysis.findings.length})` : "Review evidence details"}</summary>
        {!analysis ? <p>{recommendation ? "The documents changed. Run evidence preparation again for an updated review." : "Run evidence preparation to check the documents."}</p> : (
          <>
            <p>{analysis.summary}</p>
            {suggestedAmount && <p>Suggested amount: <strong>{suggestedAmount} USDC</strong></p>}
            {analysis.findings.map((finding, index) => {
              const references = documents.filter((document) => finding.evidenceIds.includes(document.id));
              return (
                <div className="finding" key={`${finding.code}-${index}`}>
                  <strong>{finding.code.replaceAll("_", " ")}</strong>
                  <p>{finding.message}</p>
                  {references.map((document) => (
                    <a className="text-link evidence-reference" key={document.id} href={`/api/v1/evidence/${document.id}/`} target="_blank" rel="noreferrer">
                      <FileText size={15} /> {labels[document.kind]} <ExternalLink size={13} />
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
