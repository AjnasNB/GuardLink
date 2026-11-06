# Verified contribution route

The final route uses existing official Uniswap v3 liquidity on Base Sepolia (84532) and settles coverage on Arc Testnet (5042002). The GLCT token and Ethereum Sepolia fork remain a separate historical rehearsal. No live proof is attributed to fork hashes.

| Step | Verified result |
| --- | --- |
| Official WETH/USDC pool | `0x57183717A087d2fe3Ad890873877244c3B96156c`, 0.01% tier |
| Swap | 0.001 WETH in, 2.243326 canonical USDC out; minimum 2.232109 |
| Bridge | 1.1 USDC burned; Arc mint confirmed; recipient balance at mint block increased 1.096341 USDC after fees |
| Pool deposit | 1 canonical USDC deposited on Arc |
| Coverage | Policy NFT #3 owned by member A, with the governed 6 USDC limit |

[Swap receipt](https://sepolia.basescan.org/tx/0xb063d608febe4f5dc30df6bca66f691b4a984ed7d47a53bf2ab4c474142bc90d), [Arc arrival](https://testnet.arcscan.app/tx/0xb4db4066d78454807ae3528ff100ee276cf074745da3e21256bff69b1bc45ec0), [Arc deposit](https://testnet.arcscan.app/tx/0x2cc5c370e1a440be29da3be1901a5306937d583b9b47374c6184b911590d5c19).

Read the [receipt ledger](contribution-route.base-sepolia.public.json) or run `node scripts/verify-contribution.mjs`. The verifier checks successful receipts, token transfers and canonical burn, the Arc recipient balance at the mint block, the contribution event, and NFT owner/coverage. It sends no transactions and prints its result without changing the checked-in evidence. Use `--write-proof` only to refresh the two published proof files deliberately.

The replayable operator stages are `node --import tsx scripts/contribution-route.mjs plan --base-sepolia`, then `swap`, `bridge`, and `contribute` with `--base-sepolia --testnet`. These use the dedicated encrypted local signers, not a user's mainnet account or a hosted developer key. The script preserves existing successful proof and refuses a second burn after an unresolved bridge attempt. Do not rerun mutation stages to produce a video when the receipts are already present. The coverage view displays this actual recorded route; ordinary member deposits can use the direct Arc wallet flow.
