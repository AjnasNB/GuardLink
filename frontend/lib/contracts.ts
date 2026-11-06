import {
  createPublicClient,
  http,
  parseAbi,
  type Address,
  type Abi,
  encodeFunctionData,
  parseUnits,
} from "viem";
import { arc, wallet, switchArc, usdcAddress } from "./wallet";
import { api, type Member } from "./api";
export const publicClient = createPublicClient({
  chain: arc,
  transport: http(),
});
export const poolAbi = parseAbi([
  "function members(address) view returns(bool)",
  "function setClaimContact(bytes32,address)",
  "function join()",
  "function verifyMember(address,bool)",
  "function assignJury(bytes32,address[3])",
  "function assignAppealJury(bytes32,address[3])",
  "function contribute() returns (uint256)",
  "function contributionAmount() view returns(uint128)",
  "function coverageLimit() view returns(uint128)",
  "function termDays() view returns(uint32)",
  "function nextPolicyId() view returns(uint256)",
  "function policies(uint256) view returns(address member,uint64 start,uint64 end,uint128 limit,uint128 used)",
  "function verifiedMembers(address) view returns(bool)",
  "function submitClaim(bytes32,uint256,uint128,uint64,bytes32)",
  "function vote(bytes32,bool,uint128,bytes32)",
  "function appeal(bytes32)",
  "function challengeClaim(bytes32,uint8)",
  "function appealVote(bytes32,bool,uint128,bytes32)",
  "function settle(bytes32)",
  "function voteProposal(uint256,bool)",
  "function executeProposal(uint256)",
  "function proposeRules(uint128,uint128,uint32,string) returns(uint256)",
  "function proposeTreasuryTransfer(address,uint128,string) returns(uint256)",
]);
const erc20 = parseAbi([
  "function approve(address,uint256) returns(bool)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
]);
export class WalletSessionMismatchError extends Error {
  constructor(readonly selectedWallet?: string) {
    super("Use your selected wallet to continue.");
  }
}
async function authorizedWallet() {
  const current = await wallet();
  const member = await api<Member>("/me");
  if (
    !member.wallet ||
    member.wallet.toLowerCase() !== current.account.toLowerCase()
  )
    throw new WalletSessionMismatchError(current.account);
  await switchArc(current.client);
  return current;
}
export async function poolWrite(
  address: string,
  functionName: string,
  args: readonly unknown[] = [],
) {
  if (!address) throw new Error("Community settlement is not connected yet.");
  const { client, account } = await authorizedWallet();
  const data = encodeFunctionData({ abi: poolAbi as Abi, functionName, args });
  const hash = await client.sendTransaction({
    to: address as Address,
    data,
    account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error("The transaction failed. No success has been recorded.");
  return hash;
}
export async function contribute(address: string, expectedContribution?: string) {
  if (!address) throw new Error("Community settlement is not connected yet.");
  const { client, account } = await authorizedWallet();
  const pool = address as Address;
  const [verified, amount, balance, allowance] = await Promise.all([
    publicClient.readContract({ address: pool, abi: poolAbi, functionName: "verifiedMembers", args: [account] }),
    publicClient.readContract({ address: pool, abi: poolAbi, functionName: "contributionAmount" }),
    publicClient.readContract({ address: usdcAddress, abi: erc20, functionName: "balanceOf", args: [account] }),
    publicClient.readContract({ address: usdcAddress, abi: erc20, functionName: "allowance", args: [account, pool] }),
  ]);
  if (!verified) throw new Error("Ask the cooperative to verify this wallet before contributing.");
  if (expectedContribution !== undefined && amount !== parseUnits(expectedContribution, 6)) {
    throw new Error("The contribution amount changed. Refresh the community terms before continuing.");
  }
  if (balance <= amount) throw new Error("Fund this wallet with enough Arc Testnet USDC for the contribution and transaction fees.");
  const confirmAccount = async () => {
    const [selected] = await client.getAddresses();
    if (selected?.toLowerCase() !== account.toLowerCase()) throw new WalletSessionMismatchError(selected);
  };
  if (allowance !== amount) {
    await confirmAccount();
    const approval = await client.writeContract({
      address: usdcAddress, abi: erc20, functionName: "approve", args: [pool, amount], account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: approval });
    if (receipt.status !== "success") throw new Error("Contribution approval failed.");
  }
  const currentAmount = await publicClient.readContract({ address: pool, abi: poolAbi, functionName: "contributionAmount" });
  if (currentAmount !== amount) throw new Error("The contribution amount changed. Refresh the community terms before continuing.");
  const { request } = await publicClient.simulateContract({ address: pool, abi: poolAbi, functionName: "contribute", account });
  await confirmAccount();
  const hash = await client.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The contribution failed on Arc. No coverage was issued.");
  return hash;
}
export async function ownedPolicies(address: string, walletAddress: string) {
  if (!address) return [];
  const next = await publicClient.readContract({
    address: address as Address,
    abi: poolAbi,
    functionName: "nextPolicyId",
  });
  const first = next > 100n ? next - 100n : 1n;
  const list = await Promise.all(
    Array.from(
      { length: Number(next - first) },
      (_, i) => first + BigInt(i),
    ).map(async (id) => {
      const p = await publicClient.readContract({
        address: address as Address,
        abi: poolAbi,
        functionName: "policies",
        args: [id],
      });
      return {
        id: id.toString(),
        member: p[0],
        start: Number(p[1]),
        end: Number(p[2]),
        limit: p[3].toString(),
        used: p[4].toString(),
      };
    }),
  );
  return list.filter(
    (p) => p.member.toLowerCase() === walletAddress.toLowerCase(),
  );
}

export async function joinCommunity(address: string) {
  const { account } = await authorizedWallet();
  const joined = await publicClient.readContract({
    address: address as Address,
    abi: poolAbi,
    functionName: "members",
    args: [account],
  });
  if (!joined) await poolWrite(address, "join");
}
