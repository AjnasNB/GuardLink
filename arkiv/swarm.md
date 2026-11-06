# Swarm encrypted evidence integration

New Mumbai work: the existing prototype did not store GuardLink evidence in Swarm or link that ciphertext from Arkiv. The Worker now encrypts document bytes with AES-GCM before upload. It keeps the decryption key in a Worker secret and checks the case role before retrieving and decrypting. Public Arkiv records contain a ciphertext reference only. The encrypted D1 copy remains available to the private analysis workflow.

Verified example:

- Arkiv entity key: `0xe8368dc91e7150767bc7d73c91ab0d8107ea4e0761e189118f7199e32cc0fa09`.
- Swarm reference: `57f4288a00a9685e070158acb1c9ca4bd8d7f41e761bd8f194404b45f2441693`.
- Public ciphertext: https://api.gateway.ethswarm.org/bytes/57f4288a00a9685e070158acb1c9ca4bd8d7f41e761bd8f194404b45f2441693
- Service: Swarm Foundation public testing gateway, `https://api.gateway.ethswarm.org`. Its subsidized uploads supply postage. The documented gateway client sends a zero placeholder header; that is **not** the actual provider batch ID. The service does not disclose the actual batch ID or purchasing wallet in the tested response. Obtain those details from the sponsor before claiming the bonus documentation is complete.

The [upload and download adapter](../worker/src/adapters/swarm.ts) passes ciphertext to Bee. The [claim routes](../worker/src/index.ts#L503) validate, encrypt and authorize evidence. The [archive route](../worker/src/routes/swarm.ts) backfills eligible documents and verifies the ciphertext round trip by hash. The [Arkiv adapter](../worker/src/adapters/arkiv.ts) publishes the `swarmReference` field. The 64 hex characters encode a 32-byte address. The application encryption key stays in Worker configuration.

## Check the existing upload

Run `node scripts/verify-public-records.mjs` from the repo root. It looks up the exact Arkiv entity, reads the corresponding bytes from the public gateway, and checks that anonymous GuardLink evidence access returns `401`. The recorded authorized read returned a synthetic PDF whose SHA-256 matched the saved evidence digest. The current Worker can serve its encrypted D1 copy during a gateway outage. The public gateway read and authorized application read check those two paths separately. [Recorded authorized verification](../docs/ethglobal/swarm-verification.json)

## Reproduce one upload and read

1. Use a configured GuardLink Worker with `EVIDENCE_KEY`, an HTTPS `SWARM_BEE_URL` and a valid `SWARM_BATCH_ID` for that Bee service. Enable a funded Rabdi writer and the corresponding RPC access if you also want the Arkiv link. Record the batch ID and buyer or provider before uploading. Use a synthetic demo PDF from [the fixture folder](../fixtures/synthetic/).
2. Sign in as the test claimant with an eligible policy. Open a synthetic claim and add one PDF through **Private documents**. The Worker encrypts the bytes before upload. For evidence created before archival was connected, the claimant can use `POST /api/v1/integrations/swarm/archive/` with `{"claimId":"<case-id>"}` to archive up to three documents and compare returned ciphertext with the original hash. [Claim rehearsal](../README.md#try-the-evidence-assistant)
3. Open the private document while signed in. Expect a readable PDF. A signed-out request to `/api/v1/evidence/<document-id>/` returns `401`. The Bee `/bytes/<reference>` URL serves ciphertext. After the authorized operator publishes the event via `POST /api/v1/integrations/arkiv/publish/`, the case query exposes the same ciphertext reference.

The owner-only [operator script](../scripts/verify-swarm.mjs) can archive eligible documents and publish pending Arkiv entries using the existing local demo wallet. It can change testnet state. Its saved output shows `archived: 0` because the verified document already had a reference.

In the uploaded 3:44 demo, the Arkiv timeline is visible at **3:10** and the linked Swarm archive is visible at **3:20**. In a fresh read, the gateway `/bytes/<reference>` and `/chunks/<reference>` endpoints both returned `200` without stamp or batch headers, and `/stamps` returned `404`. The actual batch and buyer or provider attribution need confirmation from the gateway operator or a fresh run with a documented sponsor batch. [Bee API](https://docs.ethswarm.org/api/) · [Gateway source](https://github.com/ethersphere/gateway-ui/blob/master/src/constants.ts)
