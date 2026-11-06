# Reproduce the Arkiv and Swarm evidence

1. Open [the public case query](https://guardlink.ajnasnb.com/api/v1/transparency/?caseId=dfd3e4f9-9008-4e60-b420-f10ae15c5f81). Find the `paid` milestone, its Arc transaction hash and the archive entity’s `swarmReference`.
2. From the repo root, run `node scripts/verify-public-records.mjs` with Node.js 22 or later. It checks the case scope, writer, paid receipt pointer, linked Swarm ciphertext and anonymous access denial. It uses existing demo evidence and public reads.
3. For a fresh synthetic upload and a signed-in read, follow [the Swarm procedure](swarm.md). For an operator rehearsal of the app, use [the demo runbook](../docs/ethglobal/DEMO_RUNBOOK.md).

If the public query returns `503`, the app could not query the configured Arkiv service. Check the RPC and access key, then retry. An empty timeline can also mean the case ID differs or the 30-day entities have expired. [Saved Arkiv output](../docs/ethglobal/arkiv-verification.json) · [Troubleshooting](friction.md)
