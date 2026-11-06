# GuardLink judging files

GuardLink enters **Build on Arkiv (existing projects)** on the Continuity track and requests the **Arkiv + Swarm** bonus. [Official criteria](https://ethglobal.com/events/mumbai/prizes#arkiv)

| Criterion | Evidence |
| --- | --- |
| Feedback | [Friction and reproduction](friction.md) |
| Reach | [Who uses the feature and what comes next](reach.md) |
| Why Arkiv | [Data placement and user benefit](why-arkiv.md) |
| How you use Arkiv | [Read/write flow](how-you-use-arkiv.md) and [schema, owner and expiry](schema.md) |
| Swarm bonus | [Ciphertext, linked Arkiv entity, upload and read](swarm.md) |

The [real-use](real-use.md), [what’s new](whats-new.md) and [easy-to-run](easy-to-run.md) pages answer the companion questions about this integration. The official page uses those filenames under its separate Node Tooling prize. GuardLink’s judge-facing demo is a cooperative case timeline.

Start with [Follow the fund](https://guardlink.ajnasnb.com/transparency/?caseId=dfd3e4f9-9008-4e60-b420-f10ae15c5f81), the [public case JSON](https://guardlink.ajnasnb.com/api/v1/transparency/?caseId=dfd3e4f9-9008-4e60-b420-f10ae15c5f81), or run `node scripts/verify-public-records.mjs` from the repo root with Node.js 22 or later. The script uses public reads and requires no package installation.
