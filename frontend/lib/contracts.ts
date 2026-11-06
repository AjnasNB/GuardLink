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
  "function appealVote(bytes32,bool,uint128,bytes32)",
  "function settle(bytes32)",
  "function voteProposal(uint256,bool)",
  "function executeProposal(uint256)",
  "function proposeRules(uint128,uint128,uint32,string) returns(uint256)",
]);
const erc20 = parseAbi([
  "function approve(address,uint256) returns(bool)",
  "function balanceOf(address) view returns(uint256)",
]);
async function authorizedWallet() {
  await switchArc();
  const current = await wallet();
  const member = await api<Member>("/me");
  if (
    !member.wallet ||
    member.wallet.toLowerCase() !== current.account.toLowerCase()
  )
    throw new Error(
      "Your wallet account changed. Sign out and sign in with this account before continuing.",
    );
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
  const amount = await publicClient.readContract({
    address: address as Address,
    abi: poolAbi,
    functionName: "contributionAmount",
  });
  if (expectedContribution !== undefined && amount !== parseUnits(expectedContribution, 6)) {
    throw new Error("The contribution amount changed. Refresh the community terms before continuing.");
  }
  const approval = await client.writeContract({
    address: usdcAddress,
    abi: erc20,
    functionName: "approve",
    args: [address as Address, amount],
    account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: approval,
  });
  if (receipt.status !== "success")
    throw new Error("Contribution approval failed.");
  return poolWrite(address, "contribute");
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
