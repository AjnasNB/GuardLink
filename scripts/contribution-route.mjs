import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  decodeEventLog,
  encodeFunctionData,
  formatUnits,
  http,
  parseAbi,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, baseSepolia } from "viem/chains";
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import * as defaults from "../onchain/conversion/config.ts";
import { baseSepoliaRoute } from "../onchain/conversion/base-sepolia.ts";
import { poolAddress, quoteGlctToUsdc } from "../onchain/conversion/quote.ts";
import { loadWallet, secretDir } from "./wallet-store.mjs";
const stages = ["plan", "seed", "swap", "bridge", "contribute"];
const stage = process.argv[2] ?? "plan";
if (!stages.includes(stage))
  throw new Error(`Choose one stage: ${stages.join(", ")}.`);
const fromBase = process.argv.includes("--base-sepolia"),
  sourceChain = fromBase ? baseSepolia : sepolia,
  C = { ...defaults, ...(fromBase ? baseSepoliaRoute : {}) };
const route = {
  tokenIn: C.GLCT,
  tokenOut: C.USDC,
  fee: C.FEE_TIER,
  factory: C.UNISWAP.factory,
  quoter: C.UNISWAP.quoterV2,
};
const source = "0xeb010023C8c20FA1E1A849373E36bf9B1f82DE11";
const sepRpc = fromBase
    ? "https://sepolia.base.org"
    : "https://ethereum-sepolia-rpc.publicnode.com",
  arcRpc = "https://rpc.drpc.testnet.arc.io";
const arc = defineChain({
  id: C.ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [arcRpc] } },
});
const sep = createPublicClient({ chain: sourceChain, transport: http(sepRpc) }),
  dst = createPublicClient({ chain: arc, transport: http(arcRpc) });
assert.equal(await sep.getChainId(), C.SEPOLIA_CHAIN_ID);
assert.equal(await dst.getChainId(), C.ARC_TESTNET_CHAIN_ID);
const reportPath = fromBase
  ? "docs/ethglobal/contribution-route.base-sepolia.public.json"
  : "docs/ethglobal/contribution-route.public.json";
const state = existsSync(reportPath)
  ? JSON.parse(readFileSync(reportPath, "utf8"))
  : {
      testnet: true,
      sourceChainId: C.SEPOLIA_CHAIN_ID,
      destinationChainId: C.ARC_TESTNET_CHAIN_ID,
      source,
      recipient: C.MEMBER_A,
      steps: [],
    };
const save = () =>
  writeFileSync(reportPath, JSON.stringify(state, null, 2) + "\n");
const units = (value) => parseUnits(value, 6);
const balance = (client, token, who) =>
  client.readContract({
    address: token,
    abi: C.erc20Abi,
    functionName: "balanceOf",
    args: [who],
  });
const currentPool = await poolAddress(sep, route);
const factoryAbi = parseAbi(["function factory() view returns(address)"]);
for (const periphery of [
  C.UNISWAP.positionManager,
  C.UNISWAP.swapRouter02,
  C.UNISWAP.quoterV2,
])
  assert.equal(
    (
      await sep.readContract({
        address: periphery,
        abi: factoryAbi,
        functionName: "factory",
      })
    ).toLowerCase(),
    C.UNISWAP.factory.toLowerCase(),
  );
assert.equal(
  await sep.readContract({
    address: C.USDC,
    abi: C.erc20Abi,
    functionName: "decimals",
  }),
  6,
);
assert.equal(
  await sep.readContract({
    address: C.GLCT,
    abi: C.erc20Abi,
    functionName: "decimals",
  }),
  C.GLCT_DECIMALS,
);
const gas = await sep.getBalance({ address: source }),
  usdc = await balance(sep, C.USDC, source);
if (stage === "plan") {
  console.log(
    JSON.stringify({
      testnet: true,
      source,
      sourceChainId: C.SEPOLIA_CHAIN_ID,
      destination: C.MEMBER_A,
      pool: currentPool ?? null,
      sourceEth: formatUnits(gas, 18),
      sourceUsdc: formatUnits(usdc, 6),
      minimumSeedUsdc: fromBase ? "0" : C.SEED_AMOUNT,
      sourceToken: fromBase ? "WETH" : "GLCT",
      liveSwap: !!state.swap,
      liveBridge: state.bridge?.state === "success",
      arcContribution: !!state.contribution,
    }),
  );
  process.exit(0);
}
if (!process.argv.includes("--testnet"))
  throw new Error(
    "Pass --testnet after reviewing the published testnet-only route.",
  );
const deployer = await loadWallet(
  JSON.parse(readFileSync("preparation/deployment-wallet.local.json", "utf8")),
);
assert.equal(deployer.address.toLowerCase(), source.toLowerCase());
const account = privateKeyToAccount(deployer.privateKey),
  sourceWallet = createWalletClient({
    account,
    chain: sourceChain,
    transport: http(sepRpc),
  });
async function send(client, wallet, address, abi, functionName, args, label) {
  const { request } = await client.simulateContract({
    account: wallet.account,
    address,
    abi,
    functionName,
    args,
  });
  const hash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({
    hash,
    timeout: 120000,
  });
  assert.equal(receipt.status, "success");
  state.steps.push({
    label,
    chainId: wallet.chain.id,
    hash,
    block: receipt.blockNumber.toString(),
  });
  save();
  console.log(JSON.stringify({ label, chainId: wallet.chain.id, hash }));
  return receipt;
}
async function allowance(client, wallet, token, spender, amount, label) {
  const approved = await client.readContract({
    address: token,
    abi: C.erc20Abi,
    functionName: "allowance",
    args: [wallet.account.address, spender],
  });
  if (approved < amount)
    await send(
      client,
      wallet,
      token,
      C.erc20Abi,
      "approve",
      [spender, amount],
      label,
    );
}
if (stage === "seed") {
  if (fromBase)
    throw new Error(
      "Base Sepolia uses an existing official v3 pool. No test liquidity seed is needed.",
    );
  if (state.seeded) {
    console.log("Existing seeded liquidity proof preserved.");
    process.exit(0);
  }
  if (gas < parseUnits("0.002", 18) || usdc < units(C.SEED_AMOUNT))
    throw new Error(
      "Dedicated EOA needs at least 0.002 Sepolia ETH for gas and 5 Sepolia USDC for test liquidity.",
    );
  const desired = units(C.SEED_AMOUNT),
    need = desired + units(C.SWAP_IN_AMOUNT),
    glct = await balance(sep, C.GLCT, source);
  if (glct < need)
    await send(
      sep,
      sourceWallet,
      C.GLCT,
      C.glctAbi,
      "faucet",
      [source, need - glct],
      "mint-valueless-demo-token",
    );
  const [t0, t1] = C.sortTokens(C.GLCT, C.USDC);
  if (!currentPool)
    await send(
      sep,
      sourceWallet,
      C.UNISWAP.positionManager,
      C.positionManagerAbi,
      "createAndInitializePoolIfNecessary",
      [t0, t1, C.FEE_TIER, C.SQRT_PRICE_1_TO_1],
      "create-official-v3-pool",
    );
  await allowance(
    sep,
    sourceWallet,
    C.GLCT,
    C.UNISWAP.positionManager,
    desired,
    "approve-demo-token-liquidity",
  );
  await allowance(
    sep,
    sourceWallet,
    C.USDC,
    C.UNISWAP.positionManager,
    desired,
    "approve-canonical-usdc-liquidity",
  );
  const deadline =
      (await sep.getBlock()).timestamp + BigInt(C.DEADLINE_SECONDS),
    min = (desired * 99n) / 100n;
  await send(
    sep,
    sourceWallet,
    C.UNISWAP.positionManager,
    C.positionManagerAbi,
    "mint",
    [
      {
        token0: t0,
        token1: t1,
        fee: C.FEE_TIER,
        tickLower: C.TICK_LOWER,
        tickUpper: C.TICK_UPPER,
        amount0Desired: desired,
        amount1Desired: desired,
        amount0Min: min,
        amount1Min: min,
        recipient: source,
        deadline,
      },
    ],
    "seed-synthetic-1-to-1-liquidity",
  );
  state.pool = await poolAddress(sep, route);
  assert.ok(state.pool);
  assert.ok(
    (await sep.readContract({
      address: state.pool,
      abi: C.poolAbi,
      functionName: "liquidity",
    })) > 0n,
  );
  state.seeded = true;
  save();
} else if (stage === "swap") {
  if (state.swap) {
    console.log("Existing swap proof preserved.");
    process.exit(0);
  }
  assert.ok(
    currentPool &&
      (fromBase ||
        (state.seeded &&
          currentPool.toLowerCase() === state.pool.toLowerCase())),
    "No supported official pool was found.",
  );
  state.pool = currentPool;
  const amountIn = parseUnits(C.SWAP_IN_AMOUNT, C.GLCT_DECIMALS),
    quote = await quoteGlctToUsdc(
      sep,
      amountIn,
      currentPool,
      C.DEFAULT_SLIPPAGE_BPS,
      route,
    );
  assert.ok(quote.impactBps <= C.IMPACT_BLOCK_BPS);
  assert.ok(
    quote.minOut >= units(C.BRIDGE_AMOUNT),
    "Minimum output does not cover the planned bridge.",
  );
  if (fromBase) {
    const wrapped = await balance(sep, C.GLCT, source);
    if (wrapped < amountIn) {
      assert.ok(
        gas >= amountIn - wrapped + parseUnits("0.002", 18),
        "Insufficient Base Sepolia gas reserve.",
      );
      const hash = await sourceWallet.writeContract({
        address: C.GLCT,
        abi: parseAbi(["function deposit() payable"]),
        functionName: "deposit",
        value: amountIn - wrapped,
      });
      const receipt = await sep.waitForTransactionReceipt({ hash });
      assert.equal(receipt.status, "success");
      state.steps.push({
        label: "wrap-test-eth",
        chainId: sourceChain.id,
        hash,
        block: receipt.blockNumber.toString(),
      });
      save();
    }
  }
  await allowance(
    sep,
    sourceWallet,
    C.GLCT,
    C.UNISWAP.swapRouter02,
    amountIn,
    "approve-exact-demo-swap",
  );
  const before = await balance(sep, C.USDC, source),
    deadline = (await sep.getBlock()).timestamp + BigInt(C.DEADLINE_SECONDS);
  const data = encodeFunctionData({
    abi: C.swapRouter02Abi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: C.GLCT,
        tokenOut: C.USDC,
        fee: C.FEE_TIER,
        recipient: source,
        amountIn,
        amountOutMinimum: quote.minOut,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  const receipt = await send(
    sep,
    sourceWallet,
    C.UNISWAP.swapRouter02,
    C.swapRouter02Abi,
    "multicall",
    [deadline, [data]],
    "swap-demo-token-for-canonical-usdc",
  );
  const received = (await balance(sep, C.USDC, source)) - before;
  assert.ok(received >= quote.minOut);
  state.swap = {
    txHash: receipt.transactionHash,
    amountIn: C.SWAP_IN_AMOUNT,
    tokenIn: fromBase ? "WETH" : "GLCT",
    received: formatUnits(received, 6),
    minimum: formatUnits(quote.minOut, 6),
    priceImpactBps: quote.impactBps,
  };
  save();
} else {
  const member = JSON.parse(
      readFileSync(join(secretDir, "actors.local.json"), "utf8"),
    ).find((a) => a.id === "member-a"),
    memberKey = await loadWallet(member);
  assert.equal(memberKey.address.toLowerCase(), C.MEMBER_A.toLowerCase());
  if (stage === "bridge") {
    if (state.bridge?.state === "success") {
      console.log("Existing bridge proof preserved.");
      process.exit(0);
    }
    assert.ok(
      state.swap && units(state.swap.received) >= units(C.BRIDGE_AMOUNT),
      "A confirmed swap must cover the bridge.",
    );
    assert.ok(
      !state.bridgeStartedAt,
      "A prior bridge may already have burned funds. Recover from its receipts instead of burning again.",
    );
    const before = await balance(dst, C.ARC_USDC, C.MEMBER_A);
    state.arcBeforeAtomic = before.toString();
    state.bridgeStartedAt = new Date().toISOString();
    save();
    const from = createViemAdapterFromPrivateKey({
        privateKey: deployer.privateKey,
      }),
      to = createViemAdapterFromPrivateKey({
        privateKey: memberKey.privateKey,
      }),
      kit = new BridgeKit();
    const result = await kit.bridge({
      from: {
        adapter: from,
        chain: fromBase ? "Base_Sepolia" : "Ethereum_Sepolia",
      },
      to: { adapter: to, chain: "Arc_Testnet", recipientAddress: C.MEMBER_A },
      amount: C.BRIDGE_AMOUNT,
    });
    const after = await balance(dst, C.ARC_USDC, C.MEMBER_A);
    state.bridge = {
      state: result.state,
      amount: C.BRIDGE_AMOUNT,
      steps: result.steps.map(({ name, state, txHash }) => ({
        name,
        state,
        txHash,
      })),
      arcReceivedAtomic: (after - before).toString(),
    };
    save();
    assert.equal(result.state, "success");
    assert.ok(
      after - before >= units("1"),
      "Destination balance increase did not cover a contribution.",
    );
  } else {
    if (state.contribution) {
      console.log("Existing contribution proof preserved.");
      process.exit(0);
    }
    assert.equal(state.bridge?.state, "success");
    assert.ok(BigInt(state.bridge.arcReceivedAtomic) >= units("1"));
    const policyAbi = parseAbi([
      "function contribute() returns(uint256)",
      "function contributionAmount() view returns(uint128)",
      "function verifiedMembers(address) view returns(bool)",
      "event Contribution(address indexed member,uint256 indexed policyId,uint128 amount)",
    ]);
    const memberWallet = createWalletClient({
      account: privateKeyToAccount(memberKey.privateKey),
      chain: arc,
      transport: http(arcRpc),
    });
    assert.equal(
      await dst.readContract({
        address: C.GUARDLINK_POOL,
        abi: policyAbi,
        functionName: "verifiedMembers",
        args: [C.MEMBER_A],
      }),
      true,
    );
    const amount = await dst.readContract({
      address: C.GUARDLINK_POOL,
      abi: policyAbi,
      functionName: "contributionAmount",
    });
    assert.ok(amount <= BigInt(state.bridge.arcReceivedAtomic));
    await allowance(
      dst,
      memberWallet,
      C.ARC_USDC,
      C.GUARDLINK_POOL,
      amount,
      "approve-bridged-contribution",
    );
    const receipt = await send(
      dst,
      memberWallet,
      C.GUARDLINK_POOL,
      policyAbi,
      "contribute",
      [],
      "deposit-canonical-usdc-and-issue-policy",
    );
    const proof = receipt.logs
      .filter(
        (log) => log.address.toLowerCase() === C.GUARDLINK_POOL.toLowerCase(),
      )
      .map((log) => {
        try {
          return decodeEventLog({
            abi: policyAbi,
            data: log.data,
            topics: log.topics,
          });
        } catch {
          return null;
        }
      })
      .find((log) => log?.eventName === "Contribution");
    assert.equal(proof.args.member.toLowerCase(), C.MEMBER_A.toLowerCase());
    assert.equal(proof.args.amount, amount);
    state.contribution = {
      txHash: receipt.transactionHash,
      policyId: proof.args.policyId.toString(),
      amount: formatUnits(amount, 6),
    };
    save();
  }
}
console.log(
  JSON.stringify({
    stage,
    testnet: true,
    proof: state[stage === "seed" ? "pool" : stage === "contribute" ? "contribution" : stage],
  }),
);
