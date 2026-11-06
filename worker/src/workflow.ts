import {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";
import { applyRecommendation, checklist, requiredDocuments } from "@guardlink/domain";
import { analyzeDocuments } from "./adapters/azure";
import { base64, decrypt, event, loadClaim, now, saveClaim } from "./lib";
export class ClaimAnalysisWorkflow extends WorkflowEntrypoint<
  Cloudflare.Env,
  { claimId: string; revision: number }
> {
  async run(
    eventInput: WorkflowEvent<{ claimId: string; revision: number }>,
    step: WorkflowStep,
  ) {
    const { claimId, revision } = eventInput.payload;
    const claim = await step.do("load case", () =>
      loadClaim(this.env.DB, claimId),
    );
    if (claim.revision !== revision) return { status: "superseded" };
    const recommendation = await step.do(
      "prepare evidence recommendation",
      {
        retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
        timeout: "2 minutes",
      },
      async () => {
        const base = checklist(claim.documents, revision);
        if (
          base.missing.length ||
          !this.env.AZURE_ENDPOINT ||
          !this.env.AZURE_API_KEY ||
          !this.env.AZURE_DEPLOYMENT
        )
          return base;
        const newestFirst = [...claim.documents].reverse();
        const required = requiredDocuments.flatMap((kind) => {
          const document = newestFirst.find((evidence) => evidence.kind === kind);
          return document ? [document] : [];
        });
        const selected = [
          ...required,
          ...newestFirst.filter((document) => !required.includes(document)),
        ].slice(0, 6);
        const docs = await Promise.all(
          selected.map(async (evidence) => {
            const row = await this.env.DB.prepare(
              "SELECT ciphertext,iv FROM evidence WHERE id=?",
            )
              .bind(evidence.id)
              .first<{ ciphertext: number[]; iv: string }>();
            if (!row) throw new Error("Evidence not found.");
            const bytes = await decrypt(
              new Uint8Array(row.ciphertext).buffer,
              row.iv,
              this.env.EVIDENCE_KEY,
            );
            return {
              evidence,
              data: base64(new Uint8Array(bytes)),
              mime: evidence.name.toLowerCase().endsWith(".pdf")
                ? "application/pdf"
                : evidence.name.toLowerCase().endsWith(".png")
                  ? "image/png"
                  : "image/jpeg",
            };
          }),
        );
        return {
          ...base,
          evidenceIds: selected.map((document) => document.id),
          ...(await analyzeDocuments(
            this.env.AZURE_ENDPOINT,
            this.env.AZURE_DEPLOYMENT,
            this.env.AZURE_API_KEY,
            docs,
            revision,
            claim.requestedAmount,
          )),
        };
      },
    );
    return step.do("publish private result and safe status", async () => {
      const current = await loadClaim(this.env.DB, claimId);
      if (current.revision !== revision) return { status: "superseded" };
      const next = applyRecommendation(
        current,
        recommendation,
        crypto.randomUUID(),
        now(),
      );
      await saveClaim(this.env.DB, next, current.storageRevision);
      await event(this.env.DB, claimId, next.status, {
        claimId,
        status: next.status,
      });
      return { status: next.status };
    });
  }
}
