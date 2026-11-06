> Historical Ethereum Sepolia route and fork rehearsal. The working final route uses Base Sepolia WETH/USDC and is documented in [CONVERSION_RUN.md](../../docs/ethglobal/CONVERSION_RUN.md). Do not use fork receipts as live proof.

# GuardLink contribution conversion: Sepolia (Uniswap v3) to Arc Testnet

SYNTHETIC, NON-MARKET DEMO. GLCT is a valueless faucet-only mock token. The pool price (1 GLCT = 1 USDC) is set by the demo script and is not a market price. Testnet only. Nothing is credited to a member until USDC has arrived on Arc Testnet AND that member has made a separate GuardLinkPool contribution.

## Live status (honest)

| Step | Status |
| --- | --- |
| Verify Uniswap and Circle addresses | Done (below) |
| Deploy GLCT mock token on Ethereum Sepolia | Done, receipt below |
| Create and seed the pool | NOT DONE (blocked) |
| Swap GLCT to canonical Sepolia USDC | NOT DONE (blocked) |
| Bridge about 1.1 USDC to Arc member A | NOT DONE (blocked) |
| Destination Arc balance proof | NOT DONE (blocked) |

Blocker: the Circle Standard Developer API key could not be created. Arc Studio's key provisioning failed twice with "An error occurred creating the API key. Please use the dev console to create the API key and register entity secret." Without `CIRCLE_API_KEY` and a registered `CIRCLE_ENTITY_SECRET` there is no hosted Circle wallet, so there is no address to fund from the Sepolia faucet and no signer for the pool, swap or bridge. No result was substituted. To unblock: create a Standard Developer API key in the Circle Console, add it to `.env` as `CIRCLE_API_KEY`, then register an entity secret (back up the recovery file), and run the commands below.

The script logic was rehearsed on an anvil fork of Ethereum Sepolia (not live, see `docs/conversion-fork-rehearsal.json`): pool creation, seeding, quote and swap all executed against the real Uniswap contracts. A 1.3 GLCT swap returned 1.286246 USDC (quote equals execution, minimum 1.279814, price impact 0.76%). The bridge cannot be rehearsed on a fork.

## Verified addresses (Ethereum Sepolia, chain 11155111)

| Item | Address | Source / check |
| --- | --- | --- |
| UniswapV3Factory | `0x0227628f3F023bb0B980b67D528571c95c6DaC1c` | Uniswap docs; returned by all three periphery contracts onchain |
| SwapRouter02 | `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E` | Uniswap docs; `factory()` read onchain |
| NonfungiblePositionManager | `0x1238536071E1c677A632429e3655c799b22cDA52` | Uniswap docs; `factory()` read onchain |
| QuoterV2 | `0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3` | Uniswap docs; `factory()` read onchain |
| Circle USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | Circle USDC contract address page; symbol USDC, 6 decimals read onchain; CCTP domain 0 |
| GLCT (mock) | `0x686e37bb7b30c9a81a1dc765914357b19ff78c30` | Deployed here, 6 decimals |
| Arc Testnet USDC (ERC-20 view) | `0x3600000000000000000000000000000000000000` | Arc chain facts, 6 decimals |
| GuardLinkPool (Arc Testnet) | `0x335d2ce0c397016ac0e1d6930eb98a1dfe47c895` | Previous deployment |
| Member A (Arc recipient) | `0x6E70a2D98A7aEf32ab3450a67fF593BB4cE6ebF6` | Given |

Pool: fee tier 3000 (0.3%, tick spacing 60), tokens sorted by address (USDC is token0, GLCT is token1), initial sqrtPriceX96 = 2^96 (synthetic 1:1), position ticks -600 to 600, seed 5 GLCT + 5 USDC. The pool address is created on the first seed run and recorded in `docs/conversion-run.json`. The Uniswap Trading API is not used: it does not list Arc Testnet. Direct protocol calls are used.

## Deployment receipt (GLCT mock)

- Contract: `contracts/mocks/GuardLinkContributionToken.sol`, ABI `docs/GuardLinkContributionToken.abi.json`
- Address `0x686e37bb7b30c9a81a1dc765914357b19ff78c30`, tx `0x5e3bb6a76996894b40ecd18349df38443078ec279dab612909be926835f3d71d`
- https://sepolia.etherscan.io/address/0x686e37bb7b30c9a81a1dc765914357b19ff78c30
- Faucet: `faucet(to, amount)` mints up to 100 GLCT per call to the caller only, with a 10 minute cooldown. No owner, admin or privileged mint.
- Etherscan source verification: not done (no explorer API key in this project). Verify manually with the file above, compiler 0.8.28, optimizer on with 200 runs, EVM Cancun, no constructor arguments.
- Review: both reviews clean after one fix (self-claim only, which stops cooldown griefing). 33 token tests plus the 152 existing GuardLink tests pass (185 total). GuardLinkPool and its tests were not modified.

## Swap handling

- Quote: QuoterV2 `quoteExactInputSingle` (simulated, never sent), live every run.
- Price impact is measured against the fee-free mid price from the pool's sqrtPriceX96. Above 1% the script warns, above 5% it refuses.
- Minimum output = quote less slippage. Default 0.5%, hard cap 1%, never zero.
- Deadline: later of head block time and wall clock, plus 20 minutes, passed through SwapRouter02 `multicall(deadline, data)` because SwapRouter02's single swap has no deadline field.
- Approvals are exact amounts, not unlimited. Every swap has value 0.

## Faucet sources

- Sepolia ETH (gas) and Sepolia USDC: Arc Studio's testnet faucet tool, for the hosted wallet address (rate limited). Not yet requested, because the wallet does not exist.
- GLCT: the token's own `faucet` function, called by the script.

## Reproduce

```bash
bun run conversion plan                  # read-only: addresses, pool, quote
bun run conversion wallet                # creates the hosted wallet on ETH-SEPOLIA, saves id and address to .env
# fund that address on Sepolia with ETH and at least 5 USDC (Studio faucet), then:
bun run conversion seed                  # GLCT faucet, approvals, create and initialise pool, mint position
bun run conversion swap                  # quote, guards, approve, swap with minimum output and deadline
bun run conversion bridge --yes          # CCTP via Circle Wallets adapter to member A on Arc Testnet
bun run conversion proof                 # destination Arc balance versus the balance recorded before the bridge
```

Live receipts land in `docs/conversion-run.json`. The preview in Studio reads that file and the chains; it shows "Not credited" until a bridge receipt, an Arc balance increase and a separate pool policy all exist.

Fork rehearsal (no keys, no real transactions): start `anvil --fork-url <sepolia rpc>` and run `fund`, `seed`, `swap` with `--mode fork`.

## Sources of the integration

- `scripts/guardlink-conversion/config.ts`: addresses, ABIs, parameters, safety limits
- `scripts/guardlink-conversion/quote.ts`: pool lookup and quote with price impact
- `scripts/guardlink-conversion/signer.ts`: Circle wallet signer and fork signer
- `scripts/guardlink-conversion/run.ts`: stages
- `src/components/ConversionPreview.tsx`, `src/components/CreditStatus.tsx`: Studio preview
