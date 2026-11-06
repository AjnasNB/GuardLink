import {
  createWalletClient,
  custom,
  defineChain,
  parseUnits,
  type Address,
  type EIP1193Provider,
} from "viem";
export const arc = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.drpc.testnet.arc.io"] } },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
});
declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}
export async function wallet() {
  if (!window.ethereum)
    throw new Error(
      "Open GuardLink in a wallet browser or install a browser wallet to continue.",
    );
  const client = createWalletClient({
    chain: arc,
    transport: custom(window.ethereum),
  });
  const [account] = await client.requestAddresses();
  if (!account) throw new Error("Choose a wallet account to continue.");
  return { client, account };
}
export async function switchArc() {
  const { client } = await wallet();
  try {
    await client.switchChain({ id: arc.id });
  } catch (error) {
    if ((error as { code: number }).code === 4902) {
      await client.addChain({ chain: arc });
      await client.switchChain({ id: arc.id });
    } else throw error;
  }
}
export const usdcAddress =
  "0x3600000000000000000000000000000000000000" as Address;
export const usdcAmount = (amount: string) => parseUnits(amount, 6);
