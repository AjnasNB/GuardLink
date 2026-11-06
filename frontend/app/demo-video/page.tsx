import Link from "next/link";

export const metadata = { title: "Watch the GuardLink demo" };
const video = "https://pub-224a53d601544dea82e44e363f7a0269.r2.dev/GuardLink-Mumbai-Final-Pauses.mp4";

export default function DemoVideo() {
  return (
    <main className="workspace-content ledger-page">
      <nav className="ledger-nav" aria-label="GuardLink public pages">
        <Link href="/">GuardLink</Link>
        <a href="https://ethglobal.com/showcase/guardlink-qcbtr">ETHGlobal Showcase</a>
      </nav>
      <header className="ledger-heading">
        <span className="ledger-network">ETHGlobal Mumbai · Continuity Track</span>
        <h1>Watch the GuardLink demo</h1>
        <p>The submitted 3:44 walkthrough with the founder’s narration and synthetic testnet claims.</p>
      </header>
      <video className="public-demo-video" controls playsInline preload="metadata" src={video} aria-label="GuardLink ETHGlobal walkthrough" />
      <p><a className="text-link" href={video}>Open the original MP4</a></p>
    </main>
  );
}
