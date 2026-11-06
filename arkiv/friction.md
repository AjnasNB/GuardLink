# Integration friction

The project needed a Rabdi-scoped Hub access key and a funded writer. The public RPC rejected unauthenticated requests. The Hub masked the key and the browser automation clipboard did not carry it to the private setup form. A human completed faucet verification for the dedicated writer; the key was installed as a Worker secret. The SDK transport passes `X-API-KEY`, never a browser-visible URL parameter.

Publishing several records waits for individual chain confirmations. Smaller batches and prioritizing new evidence links made it practical to verify. An official minimal example for a server-side custom RPC header, funded writer and confirmed create/query would shorten setup. See the measured check timestamp and count in the public verification artifact; this project does not claim a measured time-to-first-success benchmark.
