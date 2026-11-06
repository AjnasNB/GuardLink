import { guardlinkAbi } from "@guardlink/domain/abi";
import { decodeEventLog, formatUnits, isAddress, parseUnits, toEventSelector } from "viem";
import { z } from "zod";

export const ledgerKind = z.enum(["contributions", "payouts", "treasury"]);
const events = {
  contributions: "Contribution(address,uint256,uint128)",
  payouts: "ClaimPaid(bytes32,address,uint128)",
  approvals: "ClaimApproved(bytes32,uint128,bool)",
  treasury: "TreasuryTransferred(uint256,address,uint128)",
} as const;

const cursor = z.object({ index: z.number().int().nonnegative(), block_number: z.number().int().nonnegative() });
const topic = z.string().regex(/^0x[0-9a-f]{64}$/i).transform((value) => value as `0x${string}`);
const explorerPage = z.object({
  items: z.array(z.object({
    address: z.object({ hash: z.string().refine(isAddress) }),
    block_number: z.number().int().nonnegative(),
    block_timestamp: z.iso.datetime({ offset: true }),
    data: z.string().regex(/^0x(?:[0-9a-f]{2})*$/i).transform((value) => value as `0x${string}`),
    index: z.number().int().nonnegative(),
    topics: z.array(topic.nullable()),
    transaction_hash: topic,
  })),
  next_page_params: cursor.nullable(),
});

export const ledgerQuery = z.object({
  kind: ledgerKind.default("contributions"),
  before: z.string().regex(/^\d{1,12}:\d{1,8}$/).optional(),
});

export async function loadLedger(pool: string, { kind, before }: { kind: keyof typeof events; before?: string }) {
  if (!isAddress(pool)) throw new Error("Arc pool is unavailable.");
  const url = new URL(`https://testnet.arcscan.app/api/v2/addresses/${pool}/logs`);
  const selector = toEventSelector(events[kind]);
  url.searchParams.set("topic", selector);
  if (before) {
    const [block, index] = before.split(":");
    url.searchParams.set("block_number", block);
    url.searchParams.set("index", index);
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), cf: { cacheTtl: 10, cacheEverything: true } });
  if (!response.ok) throw new Error("Arc explorer is unavailable.");
  const page = explorerPage.parse(await response.json());
  const entries = page.items.map((row) => {
    const topics = row.topics.filter((item) => item !== null);
    if (row.address.hash.toLowerCase() !== pool.toLowerCase() || topics[0] !== selector)
      throw new Error("Unexpected pool event.");
    const decoded = decodeEventLog({ abi: guardlinkAbi, data: row.data, topics: [selector, ...topics.slice(1)] });
    const common = { block: row.block_number, time: row.block_timestamp, hash: row.transaction_hash, index: row.index };
    switch (decoded.eventName) {
      case "Contribution":
        return { ...common, wallet: decoded.args.member, amount: formatUnits(decoded.args.amount, 6), reference: `Policy #${decoded.args.policyId}` };
      case "ClaimPaid":
        return { ...common, wallet: decoded.args.claimant, amount: formatUnits(decoded.args.amount, 6), reference: "Claim payment", claimId: decoded.args.claimId };
      case "ClaimApproved":
        return { ...common, claimId: decoded.args.claimId, appeal: decoded.args.appealRound };
      case "TreasuryTransferred":
        return { ...common, wallet: decoded.args.recipient, amount: formatUnits(decoded.args.amount, 6), reference: `Proposal #${decoded.args.proposalId}` };
      default:
        throw new Error("Unexpected ledger event.");
    }
  });
  return { pool, entries, next: page.next_page_params ? `${page.next_page_params.block_number}:${page.next_page_params.index}` : null };
}

async function loadAllEvents(pool: string, kind: "payouts" | "approvals") {
  const entries: Awaited<ReturnType<typeof loadLedger>>["entries"] = [];
  const seen = new Set<string>();
  let before: string | undefined;
  for (let page = 0; page < 10; page++) {
    const result = await loadLedger(pool, { kind, before });
    entries.push(...result.entries);
    if (!result.next) return entries;
    if (seen.has(result.next)) break;
    seen.add(result.next);
    before = result.next;
  }
  throw new Error("The full Arc event history could not be loaded.");
}

export async function loadPayoutSummary(pool: string) {
  const [payments, approvals] = await Promise.all([
    loadAllEvents(pool, "payouts"),
    loadAllEvents(pool, "approvals"),
  ]);
  const appealIds = new Set(approvals.flatMap((row) =>
    "appeal" in row && row.appeal ? [row.claimId] : [],
  ));
  const paid = new Map<string, { hash: string; claimId: string; amount: string; appeal: boolean }>();
  for (const row of payments) {
    if (!("claimId" in row) || !("amount" in row) || !row.claimId || !row.amount) {
      throw new Error("Unexpected payment event.");
    }
    paid.set(row.claimId, { hash: row.hash, claimId: row.claimId, amount: row.amount, appeal: appealIds.has(row.claimId) });
  }
  const payouts = [...paid.values()];
  return {
    count: payouts.length,
    total: formatUnits(payouts.reduce((sum, payout) => sum + parseUnits(payout.amount, 6), 0n), 6),
    appeals: payouts.filter((payout) => payout.appeal).length,
    latest: payouts.slice(0, 6),
  };
}
