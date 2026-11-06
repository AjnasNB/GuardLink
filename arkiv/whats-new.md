# What Mumbai added

The earlier GuardLink prototype had a cooperative coverage and claims concept. Mumbai added a searchable public view of receipt-backed case milestones, governance decisions and an encrypted archive pointer. A person can start from a case ID, trace the paid milestone to Arc, and see that a Swarm archive exists. The private document remains behind GuardLink’s case authorization. [Continuity baseline](../docs/ethglobal/CONTINUITY_BASELINE.md) · [Live case query](https://guardlink.ajnasnb.com/api/v1/transparency/?caseId=dfd3e4f9-9008-4e60-b420-f10ae15c5f81)

Arkiv’s generic explorer surfaces entities. GuardLink gives their contents a cooperative meaning by joining the case, settlement and archive reference in a public timeline. The code writes and reads from the same project schema and writer namespace. [Adapter](../worker/src/adapters/arkiv.ts) · [Schema](schema.md)
