"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { formatUnits } from "viem";
type Proof = {
  sourceChainId: number;
  testnet: boolean;
  swap: { txHash: string; amountIn: string; tokenIn: string; received: string };
  bridge: {
    state: string;
    arcReceivedAtomic: string;
    steps: { name: string; state: string; txHash?: string }[];
  };
  contribution: { txHash: string; policyId: string; amount: string };
};
export default function ContributionRouteProof() {
  const [proof, setProof] = useState<Proof | null>(null);
  useEffect(() => {
    let mounted = true;
    void fetch("/demo/contribution-route.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const value = data as Proof | null;
        if (
          mounted &&
          value?.testnet &&
          value.sourceChainId === 84532 &&
          value.bridge?.state === "success" &&
          value.contribution?.txHash
        )
          setProof(value);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  if (!proof) return null;
  const mint = proof.bridge.steps.find((s) => /mint/i.test(s.name) && s.txHash);
  return (
    <section className="panel">
      <div className="section-row">
        <h2>Another way to contribute</h2>
        <span className="status-pill good">
          <CheckCircle2 size={14} /> Confirmed test run
        </span>
      </div>
      <p>
        Start with a supported token, receive USDC, then contribute from your
        wallet. Coverage begins only when the community deposit confirms.
      </p>
      <details style={{ marginTop: 20 }}>
        <summary style={{ cursor: "pointer" }}>
          Follow the test contribution and its receipts
        </summary>
        <div className="terms-row" style={{ flexWrap: "wrap" }}>
          <div>
            <small>Converted on Base Sepolia</small>
            <strong>{proof.swap.received} USDC</strong>
            <p className="subtle">
              From {proof.swap.amountIn} {proof.swap.tokenIn} using Uniswap
            </p>
            <a
              className="text-link"
              href={`https://sepolia.basescan.org/tx/${proof.swap.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              Swap receipt <ArrowUpRight size={15} />
            </a>
          </div>
          <div>
            <small>Received on Arc Testnet</small>
            <strong>
              {formatUnits(BigInt(proof.bridge.arcReceivedAtomic), 6)} USDC
            </strong>
            <p className="subtle">Verified destination wallet increase</p>
            {mint?.txHash && (
              <a
                className="text-link"
                href={`https://testnet.arcscan.app/tx/${mint.txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                Arrival receipt <ArrowUpRight size={15} />
              </a>
            )}
          </div>
          <div>
            <small>Deposited into the cooperative</small>
            <strong>{proof.contribution.amount} USDC</strong>
            <p className="subtle">
              Policy #{proof.contribution.policyId} issued
            </p>
            <a
              className="text-link"
              href={`https://testnet.arcscan.app/tx/${proof.contribution.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              Contribution receipt <ArrowUpRight size={15} />
            </a>
          </div>
        </div>
        <p className="subtle">
          This is a recorded test example. Your own contribution requires a
          separate wallet approval.
        </p>
      </details>
    </section>
  );
}
