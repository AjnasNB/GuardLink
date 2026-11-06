# GuardLink public record schema

Network: Rabdi testnet (7794095). Schema: `guardlink_records_v1`. Writer: `0xd8E339b19353afDAF75EfeEdA7fDB88320420553`, a dedicated project wallet. It owns the entities; member wallets own their policies on Arc. The testnet publisher does not transfer record ownership to every claimant.

| Field | Purpose |
| --- | --- |
| `project`, `recordId`, `kind`, `community`, `caseId`, `status` | Indexed selectors. `caseId` is a random case reference or empty for community records. |
| `body` | UTF-8 JSON encoded as bytes: public status, timestamps, receipt hash, and allowlisted agreement/governance values. |
| `swarmReference` | Optional 32-byte address of application-encrypted evidence, encoded as 64 hex characters. Contains no key. |

Records expire 30 days after publication. The prototype writes snapshots; it does not claim indefinite availability. Arc remains authoritative for money, votes and eligibility. Private evidence, identity, private jury reasons and decryption keys are absent. Implementation: `worker/src/adapters/arkiv.ts`.
