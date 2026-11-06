// GuardLink contribution conversion proof: Ethereum Sepolia (Uniswap v3) -> Arc Testnet (CCTP).
// SYNTHETIC, NON-MARKET demo. GLCT is a valueless faucet-only mock; the pool price is set by
// this script, not by any market. Testnet only.
import { parseAbi, type Address } from "viem";

export const SEPOLIA_CHAIN_ID = 11155111;
export const ARC_TESTNET_CHAIN_ID = 5042002;

// Uniswap v3 official Ethereum Sepolia deployments
// (https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments).
// Each one was also read onchain: all three periphery contracts return this factory.
export const UNISWAP = {
  factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
  swapRouter02: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
  positionManager: "0x1238536071E1c677A632429e3655c799b22cDA52",
  quoterV2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
} as const satisfies Record<string, Address>;

// Circle's USDC on Ethereum Sepolia comes from the app's generated chain facts and was checked
// against https://developers.circle.com/stablecoins/usdc-contract-addresses.
export const USDC: Address = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
export const USDC_DECIMALS = 6;
export const SEPOLIA_NAME = "Ethereum Sepolia";

// Faucet-only mock deployed on Ethereum Sepolia (contracts/mocks/GuardLinkContributionToken.sol).
export const GLCT: Address = "0x686e37bb7b30c9a81a1dc765914357b19ff78c30";
export const GLCT_DECIMALS = 6;

// GuardLinkPool on Arc Testnet and the member that must receive the bridged USDC.
export const ARC_USDC: Address = "0x3600000000000000000000000000000000000000";
export const MEMBER_A: Address = "0x6E70a2D98A7aEf32ab3450a67fF593BB4cE6ebF6";
export const GUARDLINK_POOL: Address =
  "0x335d2ce0c397016ac0e1d6930eb98a1dfe47c895";

// Pool shape. 0.3% tier, tick spacing 60. Price 1 GLCT = 1 USDC is SYNTHETIC. Both tokens have
// 6 decimals, so sqrtPriceX96 = 2^96 whatever the token order.
export const FEE_TIER = 3000;
export const TICK_SPACING = 60;
export const TICK_LOWER = -600;
export const TICK_UPPER = 600;
export const SQRT_PRICE_1_TO_1 = 2n ** 96n;

// Amounts in human units (both tokens have 6 decimals).
export const SEED_AMOUNT = "5"; // GLCT and USDC each
export const SWAP_IN_AMOUNT = "1.3"; // GLCT sold for USDC
export const BRIDGE_AMOUNT = "1.1"; // USDC sent to Arc

// Safety rules (same thresholds as the Uniswap guidance used for this repo).
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%
export const MAX_SLIPPAGE_BPS = 100; // hard cap 1%
export const IMPACT_WARN_BPS = 100; // warn above 1%
export const IMPACT_BLOCK_BPS = 500; // block above 5%
export const DEADLINE_SECONDS = 1200;

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
export const glctAbi = parseAbi([
  "function faucet(address to, uint256 amount)",
  "function lastClaim(address) view returns (uint256)",
  "function COOLDOWN() view returns (uint256)",
]);
export const factoryAbi = parseAbi([
  "function getPool(address,address,uint24) view returns (address)",
]);
export const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);
export const positionManagerAbi = parseAbi([
  "function createAndInitializePoolIfNecessary(address token0,address token1,uint24 fee,uint160 sqrtPriceX96) payable returns (address pool)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline) params) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
]);
export const quoterV2Abi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
// SwapRouter02 has no deadline field in exactInputSingle: the deadline goes through multicall.
export const swapRouter02Abi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)",
]);

export const sortTokens = (a: Address, b: Address): [Address, Address] =>
  BigInt(a) < BigInt(b) ? [a, b] : [b, a];

export const sepoliaTx = (hash: string) =>
  `https://sepolia.etherscan.io/tx/${hash}`;
export const arcTx = (hash: string) => `https://testnet.arcscan.app/tx/${hash}`;
