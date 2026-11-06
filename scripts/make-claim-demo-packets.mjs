import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeEvidence, syntheticPdf } from "./make-fixtures.mjs";

const output = process.argv[2] ?? "showtime-out/guardlink-claim-test-packets";
const date = process.argv[3] ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) {
  throw new Error("Pass a valid treatment date in YYYY-MM-DD format.");
}

const scenarios = [
  {
    folder: "01-missing-prescription",
    amount: "0.20",
    name: "Demo patient A",
    expectation: "Upload the hospital bill and discharge summary first. Prepare the evidence and check that it asks for a prescription. Upload the prescription on that same case and prepare the evidence again.",
  },
  {
    folder: "02-named-other-evidence",
    amount: "0.25",
    name: "Demo patient B",
    expectation: "Upload the three required PDFs and the payment receipt. Choose Other evidence and name it Itemized payment receipt. The name should appear on the private case, and the checklist should still count three required categories.",
    extra: true,
  },
  {
    folder: "03-inconsistent-amount",
    amount: "0.30",
    name: "Demo patient C",
    expectation: "Upload all three PDFs. The categories are complete, but the bill and discharge summary disagree. Check for a finding that cites the conflicting evidence. A human reviewer should verify the amount before making any decision.",
    conflict: true,
  },
];

mkdirSync(output, { recursive: true });
for (const scenario of scenarios) {
  const folder = join(output, scenario.folder);
  mkdirSync(folder, { recursive: true });
  const packet = makeEvidence(scenario.folder, scenario.name, date, scenario.amount);
  if (scenario.conflict) {
    packet.discharge_summary = makeEvidence(scenario.folder, scenario.name, date, "0.15").discharge_summary;
  }
  for (const [kind, pdf] of Object.entries(packet)) {
    writeFileSync(join(folder, `${kind.replaceAll("_", "-")}.pdf`), pdf);
  }
  if (scenario.extra) {
    writeFileSync(join(folder, "payment-receipt.pdf"), syntheticPdf([
      "SYNTHETIC TEST EVIDENCE - NOT A REAL MEDICAL RECORD",
      "ITEMIZED PAYMENT RECEIPT - SAMPLE HOSPITAL",
      `Case reference: ${scenario.folder}`,
      `Fictional participant: ${scenario.name}`,
      `Treatment date: ${date}`,
      "Synthetic procedure: 0.20 test USDC",
      "Synthetic follow-up fee: 0.05 test USDC",
      "Total test amount paid: 0.25 test USDC",
    ]));
  }
}

const instructions = [
  "# GuardLink claim walkthrough",
  "",
  "These PDFs use fictional patients, a sample hospital and test amounts. Use a demo member with an active policy covering the treatment date. Each folder is a separate case.",
  "",
  ...scenarios.flatMap((scenario) => [
    `## ${scenario.folder}`,
    "",
    `Use ${scenario.amount} test USDC as the requested amount and ${date} as the treatment date if covered by the policy.`,
    "",
    scenario.expectation,
    "",
  ]),
  "Stop at the evidence review screen to rehearse the draft. The checklist measures completeness. The evidence assistant may flag inconsistencies and point to sources. A jury makes the decision.",
  "",
];
writeFileSync(join(output, "START-HERE.md"), instructions.join("\n"));
console.log(`Wrote ${scenarios.length} synthetic packets to ${output}.`);
