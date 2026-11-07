import Link from "next/link";

const pages = [
  ["Transactions", "/ledger"],
  ["Votes and decisions", "/ledger/votes"],
  ["Proposals", "/governance/proposals"],
  ["Arkiv archive", "/transparency"],
] as const;

export default function PublicAuditNav({ current }: { current: typeof pages[number][1] }) {
  return (
    <nav className="governance-nav" aria-label="Public audit views">
      <Link href="/">← GuardLink</Link>
      {pages.map(([label, href]) => (
        <Link key={href} href={href} aria-current={href === current ? "page" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
