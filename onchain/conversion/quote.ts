// Shared by the script and the Studio preview: live pool lookup and a QuoterV2 quote with the
// price-impact and slippage rules. Read-only; never sends a transaction.
import type { Address, PublicClient } from "viem";
import * as C from "./config";

type Route = {
  tokenIn: Address;
  tokenOut: Address;
  fee: number;
  factory: Address;
  quoter: Address;
};
const defaultRoute: Route = {
  tokenIn: C.GLCT,
  tokenOut: C.USDC,
  fee: C.FEE_TIER,
  factory: C.UNISWAP.factory,
  quoter: C.UNISWAP.quoterV2,
};
export async function poolAddress(
  pub: PublicClient,
  route: Route = defaultRoute,
): Promise<Address | undefined> {
  const [t0, t1] = C.sortTokens(route.tokenIn, route.tokenOut);
  const pool = await pub.readContract({
    address: route.factory,
    abi: C.factoryAbi,
    functionName: "getPool",
    args: [t0, t1, route.fee],
  });
  return BigInt(pool) === 0n ? undefined : pool;
}

export interface Quote {
  quoted: bigint;
  expected: bigint;
  minOut: bigint;
  impactBps: number;
  slippageBps: number;
  liquidity: bigint;
}

export async function quoteGlctToUsdc(
  pub: PublicClient,
  amountIn: bigint,
  pool: Address,
  slippageBps: number,
  route: Route = defaultRoute,
): Promise<Quote> {
  if (slippageBps > C.MAX_SLIPPAGE_BPS || slippageBps <= 0)
    throw new Error(`Slippage must be 1..${C.MAX_SLIPPAGE_BPS} bps`);
  if (amountIn <= 0n) throw new Error("Amount must be above zero");
  const liquidity = await pub.readContract({
    address: pool,
    abi: C.poolAbi,
    functionName: "liquidity",
  });
  if (liquidity === 0n)
    throw new Error("Pool has no liquidity: run the seed stage first");
  const slot0 = await pub.readContract({
    address: pool,
    abi: C.poolAbi,
    functionName: "slot0",
  });
  const sqrtP = slot0[0];
  const { result } = await pub.simulateContract({
    address: route.quoter,
    abi: C.quoterV2Abi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: route.tokenIn,
        tokenOut: route.tokenOut,
        amountIn,
        fee: route.fee,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  const quoted = result[0];
  // Mid price from sqrtPriceX96 (fee-free); expected output applies the fee tier on top.
  const glctIsToken0 = BigInt(route.tokenIn) < BigInt(route.tokenOut);
  const p2 = sqrtP * sqrtP;
  const midOut = glctIsToken0
    ? (amountIn * p2) >> 192n
    : (amountIn << 192n) / p2;
  const expected = (midOut * BigInt(1_000_000 - route.fee)) / 1_000_000n;
  const impactBps =
    expected === 0n ? 0 : Number(((expected - quoted) * 10_000n) / expected);
  const minOut = (quoted * BigInt(10_000 - slippageBps)) / 10_000n;
  return { quoted, expected, minOut, impactBps, slippageBps, liquidity };
}
