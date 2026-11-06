# Reproduce the contract tests

The contract was built, reviewed and deployed in [Arc Studio](https://studio.arc.io/app/5b1cd267-eb2b-4f67-82cf-0f0d2b15252d). The local test run independently passed 185 tests across 13 suites (152 pool tests and 33 mock-token tests), including invariants, reentrancy, independent appeals, treasury protections and prospective governance.

Use the Arc-compatible Foundry build described in the parent setup documentation. In this directory:

```sh
forge install --no-git foundry-rs/forge-std@v1.11.0 OpenZeppelin/openzeppelin-contracts@v5.6.1
forge test --summary
```

Dependencies and build output are not committed. OpenZeppelin 5.6.1 matches the Arc Studio deployment environment; 5.4.0 was used for the first local cross-check and is superseded for exact source verification. Compilation uses Solidity 0.8.28, Cancun and optimizer runs 200 as specified in foundry.toml. Bootstrap verification and panel assignment are centralized demonstration responsibilities; this is not production-ready insurance or a substitute for independent audit.
