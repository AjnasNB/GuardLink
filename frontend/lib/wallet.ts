import {
  createWalletClient,
  custom,
  defineChain,
  parseUnits,
  type Address,
  type EIP1193Provider,
} from "viem";
import { api, type Member } from "./api";
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
export async function switchArc(client?: Awaited<ReturnType<typeof wallet>>["client"]) {
  client ??= (await wallet()).client;
  if (await client.getChainId() === arc.id) return;
  try {
    await client.switchChain({ id: arc.id });
  } catch (error) {
    if ((error as { code: number }).code === 4902) {
      await client.addChain({ chain: arc });
      await client.switchChain({ id: arc.id });
    } else throw error;
  }
}
export async function signInWithWallet() {
  const { client, account } = await wallet();
  await switchArc(client);
  const challenge = await api<{ id: string; message: string }>("/auth/challenge", {
    method: "POST",
    body: JSON.stringify({ wallet: account }),
  });
  const signature = await client.signMessage({ account, message: challenge.message });
  return api<{ member: Member }>("/auth/verify", {
    method: "POST",
    body: JSON.stringify({ id: challenge.id, signature }),
  });
}
export const usdcAddress =
  "0x3600000000000000000000000000000000000000" as Address;
export const usdcAmount = (amount: string) => parseUnits(amount, 6);
