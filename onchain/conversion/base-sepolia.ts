import type { Address } from "viem";
// Official Base Sepolia v3 deployments; verified against each periphery factory() read.
// https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments
export const baseSepoliaRoute = {
  SEPOLIA_CHAIN_ID: 84532,
  SEPOLIA_NAME: "Base Sepolia",
  USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
  GLCT: "0x4200000000000000000000000000000000000006" as Address,
  GLCT_DECIMALS: 18,
  SWAP_IN_AMOUNT: "0.001",
  FEE_TIER: 100,
  UNISWAP: {
    factory: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    positionManager: "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2",
    quoterV2: "0xC5290058841028F1614F3A6F0F5816cAd0df5E27",
    swapRouter02: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
  } as const,
} as const;
