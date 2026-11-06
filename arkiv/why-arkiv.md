# Why Arkiv

A member should be able to find the public history of one case without searching a long stream of contract events or receiving medical evidence. Arkiv provides an indexed record by case, community, kind and status, together with its owner and expiry. This makes the same disclosure usable in the app and independently queryable through the SDK.

A database-only timeline would require observers to trust GuardLink's API as the sole source of publication. With Arkiv, they can query the same entity keys under the disclosed writer and use the embedded receipt to verify the payment on Arc. The writer owns these testnet records and the 30-day expiry bounds their lifetime. [Public case query](https://guardlink.ajnasnb.com/api/v1/transparency/?caseId=dfd3e4f9-9008-4e60-b420-f10ae15c5f81) · [Schema](schema.md)

Arc holds the reserve and enforces payment and governance rules. GuardLink keeps identities, private reasons, documents and decryption keys off Arkiv because the entity data is public. The archive reference points to ciphertext on Swarm, and the application checks case authorization before decrypting. [Swarm verification](swarm.md)
