# Swarm encrypted evidence integration

New Mumbai work: the existing prototype did not store GuardLink evidence in Swarm or link that ciphertext from Arkiv. The Worker now encrypts document bytes with AES-GCM before upload. It keeps the decryption key in a Worker secret and checks the case role before retrieving and decrypting. Public Arkiv records contain a ciphertext reference only. The encrypted D1 copy remains available to the private analysis workflow.

Verified example:

- Arkiv entity key: `0xe8368dc91e7150767bc7d73c91ab0d8107ea4e0761e189118f7199e32cc0fa09`.
- Swarm reference: `57f4288a00a9685e070158acb1c9ca4bd8d7f41e761bd8f194404b45f2441693`.
- Public ciphertext: https://api.gateway.ethswarm.org/bytes/57f4288a00a9685e070158acb1c9ca4bd8d7f41e761bd8f194404b45f2441693
- Service: Swarm Foundation public testing gateway, `https://api.gateway.ethswarm.org`. Its subsidized uploads supply postage. The documented gateway client sends a zero placeholder header; that is **not** the actual provider batch ID. The service does not disclose the actual batch ID or purchasing wallet in the tested response. Obtain those details from the sponsor before claiming the bonus documentation is complete.

Code: `worker/src/adapters/swarm.ts` and the evidence upload/retrieval handlers in `worker/src/index.ts`; `worker/src/routes/swarm.ts` backfills previously encrypted synthetic evidence. The `swarmReference` field is set by `worker/src/adapters/arkiv.ts`.

Reproduce with a funded Arkiv writer and a Bee service or the official testing gateway: run `node scripts/verify-swarm.mjs`. It archives up to three existing synthetic documents for the signed claimant, checks the public bytes are ciphertext, compares the authorized plaintext PDF SHA-256 with its stored digest, checks unauthenticated access returns 401, and verifies the **same reference** appears on an Arkiv entity. For a new case, upload a synthetic fixture and view it from an authorized account. Do not upload real medical documents.

Partner demo picture cut, 3:22.5–3:34.5: the private claim shows the encrypted archive, then the cut shows the actual synthetic bill returned through authorized Swarm retrieval. The preceding Arkiv timeline starts at 3:14. The founder narration still needs to be synced. Friction: gateway postage details are not exposed, and linked records wait for a confirmed Arkiv publication. See `docs/ethglobal/swarm-verification.json` and the [official gateway source](https://github.com/ethersphere/gateway-ui/blob/master/src/constants.ts).
