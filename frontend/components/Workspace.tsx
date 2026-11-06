"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import BrandMark from "./BrandMark";
import Governance from "./Governance";
import Organizer from "./Organizer";
import Transparency from "./Transparency";
import ClaimDetail from "./ClaimDetail";
import ContributionRouteProof from "./ContributionRouteProof";
import Community from "./Community";
import { PageHeading, ClaimList, Status } from "./WorkspaceParts";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  LayoutDashboard,
  UsersRound,
  ShieldCheck,
  FileText,
  Vote,
  Wallet,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Clock,
  Check,
  LockKeyhole,
  Upload,
  LoaderCircle,
  AlertCircle,
  Scale,
  Globe,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { keccak256, toBytes, parseUnits, formatUnits } from "viem";
import { type Claim, type DocumentKind } from "@guardlink/domain";
import { api, money, short, type Config, type Member } from "../lib/api";
import {
  contribute,
  ownedPolicies,
  poolWrite,
} from "../lib/contracts";
const navigation = [
  { path: "/app", label: "Overview", icon: LayoutDashboard },
  { path: "/app/communities", label: "My community", icon: UsersRound },
  { path: "/app/coverage", label: "My coverage", icon: ShieldCheck },
  { path: "/app/claims", label: "My claims", icon: FileText },
  { path: "/app/review", label: "Review cases", icon: Scale },
  { path: "/app/governance", label: "Community votes", icon: Vote },
  { path: "/app/transparency", label: "Follow the fund", icon: Globe },
  { path: "/app/organizer", label: "Cooperative setup", icon: ShieldCheck },
];

type Policy = Awaited<ReturnType<typeof ownedPolicies>>[number];
export default function Workspace() {
  const path = usePathname().replace(/\/$/, "") || "/",
    router = useRouter();
  const [member, setMember] = useState<Member | null>(null),
    [config, setConfig] = useState<Config | null>(null),
    [claims, setClaims] = useState<Claim[]>([]),
    [policies, setPolicies] = useState<Policy[]>([]),
    [balance, setBalance] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [navOpen, setNavOpen] = useState(false);
  const refresh = useCallback(async () => {
    setError("");
    try {
      const [m, c] = await Promise.all([
        api<Member>("/me"),
        api<Config>("/config"),
      ]);
      setMember(m);
      setConfig(c);
      setClaims(await api<Claim[]>("/claims"));
      if (m.wallet) {
        const [b, p] = await Promise.all([
          api<{ balance: string | null }>("/balance"),
          ownedPolicies(c.poolAddress, m.wallet),
        ]);
        setBalance(b.balance);
        setPolicies(p);
      }
    } catch (e) {
      const text =
        e instanceof Error ? e.message : "Could not load your account.";
      if (text === "Sign in to continue.") router.replace("/login");
      else setError(text);
    } finally {
      setLoading(false);
    }
  }, [router]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    setNavOpen(false);
  }, [path]);
  async function action(fn: () => Promise<unknown>, message = "Saved.") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(message);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not complete this action.",
      );
    } finally {
      setBusy(false);
    }
  }
  const route = path.replace("/app", "") || "/";
  const inCommunity = route === "/communities" || route.startsWith("/communities/");
  function fundCoverage(expectedContribution?: string) {
    return action(async () => {
      if (!config?.poolAddress) {
        throw new Error("Settlement is unavailable. Try again when the community terms load.");
      }
      await contribute(config.poolAddress, expectedContribution);
    }, "Your contribution is confirmed. Your coverage record is ready.");
  }
  const active =
    navigation.find((n) => n.path === path)?.label ??
    (route.startsWith("/claims/")
      ? "Claim details"
      : route === "/onboarding"
        ? "Welcome to your community"
        : inCommunity ? "My community" : "Your community");
  return (
    <div className="workspace">
      <aside className={`sidebar ${navOpen ? "is-open" : ""}`}>
        <Link className="brand" href="/">
          <span className="brand-mark">
            <BrandMark />
          </span>
          GuardLink
        </Link>
        <Link className="community-switch" href="/app/communities">
          <span className="community-symbol">{member?.community_name?.[0] ?? "C"}</span>
          <div>
            {member?.community_name ?? "Your cooperative"}<small>Testnet cooperative</small>
          </div>
          <ChevronRight size={15} />
        </Link>
        <span className="nav-caption">Your protection</span>
        <nav>
          {navigation.map((n) => (
            <Link
              href={n.path}
              key={n.path}
              className={path === n.path || (n.path === "/app/communities" && inCommunity) ? "active" : ""}
            >
              <n.icon size={18} />
              {n.label}
              {n.label === "My claims" && claims.length > 0 && (
                <span className="nav-count">{claims.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-note">
            <LockKeyhole size={16} />
            <span>Your evidence stays private.</span>
          </div>
          <button
            className="account-button"
            onClick={() =>
              void api("/auth/logout", { method: "POST" }).then(() =>
                router.push("/login"),
              )
            }
          >
            <span className="avatar">{member?.name?.[0] ?? "G"}</span>
            <span>
              {member?.name ?? "Your account"}
              <small>{short(member?.wallet)}</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <div>
            <button
              aria-label="Toggle navigation"
              className="icon-button mobile-menu"
              onClick={() => setNavOpen(!navOpen)}
            >
              {navOpen ? <X /> : <Menu />}
            </button>
            <span className="breadcrumb">
              Your community <ChevronRight size={13} />
              <strong>{active}</strong>
            </span>
          </div>
          <div className="header-actions">
            <span className="testnet-pill">
              <span className="live-dot" /> Testnet demo
            </span>
            <span className="wallet-pill">
              <Wallet size={15} />
              {short(member?.wallet)}
            </span>
          </div>
        </header>
        <main className="workspace-content">
          {error && (
            <div className="alert error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <CheckCircle2 size={18} />
              {notice}
            </div>
          )}
          {loading ? (
            <div className="loading-state">
              <LoaderCircle className="spin" /> Loading your community…
            </div>
          ) : (
            <>
              {route === "/onboarding" ? (
                <Onboarding
                  member={member}
                  busy={busy}
                  save={(name) =>
                    action(async () => {
                      await api("/me", {
                        method: "PATCH",
                        body: JSON.stringify({ name }),
                      });
                      router.push("/app/communities");
                    }, "Your profile is saved.")
                  }
                />
              ) : inCommunity ? (
                <Community
                  member={member}
                  communityId={route === "/communities" ? undefined : route.slice("/communities/".length)}
                  poolAddress={config?.poolAddress}
                  hasActiveCoverage={policies.some((p) => p.start * 1000 <= Date.now() && p.end * 1000 > Date.now())}
                  busy={busy}
                  refreshAccount={refresh}
                  onContribute={fundCoverage}
                />
              ) : route === "/coverage" ? (
                <Coverage
                  policies={policies}
                  member={member}
                  busy={busy}
                  onContribute={() => void fundCoverage()}
                />
              ) : route === "/claims/new" ? (
                <NewClaim
                  policies={policies}
                  busy={busy}
                  create={(data) =>
                    action(async () => {
                      const created = await api<Claim>("/claims", {
                        method: "POST",
                        body: JSON.stringify(data),
                      });
                      router.push(`/app/claims/${created.id}`);
                    }, "Your claim has one case ID. Add your documents below.")
                  }
                />
              ) : route.startsWith("/claims/") ? (
                <ClaimDetail
                  id={route.split("/")[2]}
                  member={member}
                  config={config}
                  busy={busy}
                  run={action}
                />
              ) : route === "/claims" || route === "/review" ? (
                <>
                  <PageHeading
                    title={
                      route === "/review"
                        ? member?.role === "contact"
                          ? "Cases you help with."
                          : "A fair review starts here."
                        : "Your claims, clearly."
                    }
                    description={
                      route === "/review"
                        ? member?.role === "contact"
                          ? "A member must authorize your access to their case. You help them follow the next step."
                          : "Review the cases assigned to you. Every decision needs a reason."
                        : "One case ID. Every update. A clear next step."
                    }
                    action={
                      route === "/claims" ? (
                        <Link
                          className="button button-lime"
                          href="/app/claims/new"
                        >
                          <Plus size={17} /> Start a claim
                        </Link>
                      ) : undefined
                    }
                  />
                  <ClaimList
                    claims={claims.filter((c) =>
                      route === "/review"
                        ? c.jurors.includes(member?.id ?? "") ||
                          c.appealJurors.includes(member?.id ?? "") ||
                          c.contactId === member?.id
                        : c.memberId === member?.id,
                    )}
                  />
                </>
              ) : route === "/organizer" ? (
                <Organizer config={config} busy={busy} run={action} />
              ) : route === "/governance" ? (
                <Governance config={config} busy={busy} run={action} />
              ) : route === "/transparency" ? (
                <Transparency />
              ) : (
                <>
                  <PageHeading
                    title={`A little peace of mind, ${member?.name === "New member" ? "neighbour" : (member?.name.split(" ")[0] ?? "neighbour")}.`}
                    description="Your protection. Your people. Everything in one place."
                    action={
                      <Link
                        className="button button-lime"
                        href="/app/claims/new"
                      >
                        Start a claim <ArrowUpRight size={17} />
                      </Link>
                    }
                  />
                  <div className="overview-grid">
                    <section className="coverage-hero">
                      <div className="coverage-top">
                        <span>
                          <ShieldCheck size={18} /> Your protection
                        </span>
                        <span className="status-pill">
                          {policies.length
                            ? "Coverage recorded"
                            : "Start with your community"}
                        </span>
                      </div>
                      <h2>
                        {policies.length
                          ? "A shared safety net."
                          : "A stronger place to stand."}
                      </h2>
                      <p>
                        {policies.length
                          ? "Your contributions and coverage are recorded. Your community is here when you need support."
                          : "Join the cooperative, understand the terms and make your first contribution."}
                      </p>
                      <Link href="/app/coverage" className="text-link">
                        {policies.length
                          ? "View my coverage"
                          : "Explore my coverage"}{" "}
                        <ArrowUpRight size={17} />
                      </Link>
                      <div className="coverage-stamp">
                        <Plus size={120} strokeWidth={0.6} />
                      </div>
                    </section>
                    <section className="wallet-card">
                      <Wallet size={22} />
                      <span>Your test wallet</span>
                      <strong>
                        {money(balance)} <small>USDC</small>
                      </strong>
                      <p>
                        Test tokens only. Keep a little available for
                        transaction fees.
                      </p>
                      <a
                        href="https://faucet.circle.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-link"
                      >
                        Get test funds <ArrowUpRight size={16} />
                      </a>
                    </section>
                  </div>
                  <div className="section-row">
                    <h2>Your next steps</h2>
                    <span>Make protection feel familiar.</span>
                  </div>
                  <div className="next-steps">
                    <Link href="/app/communities">
                      <span className="step-icon">
                        <UsersRound />
                      </span>
                      <div>
                        <h3>Meet your cooperative</h3>
                        <p>Understand the people, the pool and the rules.</p>
                      </div>
                      <ArrowRight size={20} />
                    </Link>
                    <Link href="/app/governance">
                      <span className="step-icon">
                        <Vote />
                      </span>
                      <div>
                        <h3>Your voice belongs here</h3>
                        <p>
                          Help decide how your community protects its members.
                        </p>
                      </div>
                      <ArrowRight size={20} />
                    </Link>
                  </div>
                  <div className="section-row">
                    <h2>Recent claims</h2>
                    <Link href="/app/claims" className="text-link">
                      View all <ArrowUpRight size={15} />
                    </Link>
                  </div>
                  <ClaimList
                    claims={claims
                      .filter((c) => c.memberId === member?.id)
                      .slice(0, 4)}
                  />
                  <div className="quiet-banner">
                    <LockKeyhole size={19} />
                    <p>
                      <strong>
                        Private evidence. A process you can follow.
                      </strong>{" "}
                      Your medical documents are shared only with authorized
                      reviewers.
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>People protect people.</span>
          <Link href="/privacy">
            Privacy & demo information <ArrowUpRight size={13} />
          </Link>
        </footer>
      </div>
    </div>
  );
}
function Onboarding({
  member,
  busy,
  save,
}: {
  member: Member | null;
  busy: boolean;
  save: (name: string) => void;
}) {
  return (
    <div className="narrow-page">
      <span className="section-note">A good place to begin.</span>
      <h1>Let’s make this yours.</h1>
      <p>
        Your profile helps your community recognize you. Your private
        information does not become a public record.
      </p>
      <form
        className="panel form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          save(new FormData(e.currentTarget).get("name") as string);
        }}
      >
        <label>
          Your name
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            defaultValue={member?.name === "New member" ? "" : member?.name}
          />
        </label>
        <label>
          Connected wallet
          <input
            readOnly
            value={member?.wallet ?? "Connect a wallet before contributing"}
          />
        </label>
        <button disabled={busy} className="button button-lime">
          Save and explore <ArrowRight size={17} />
        </button>
      </form>
    </div>
  );
}
function Coverage({
  policies,
  member,
  busy,
  onContribute,
}: {
  policies: Policy[];
  member: Member | null;
  busy: boolean;
  onContribute: () => void;
}) {
  return (
    <>
      <PageHeading
        title="Know where you stand."
        description="Your coverage is recorded when your contribution confirms."
        action={
          <button
            className="button button-lime"
            disabled={busy || !member?.verified}
            onClick={onContribute}
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Plus size={17} />
            )}{" "}
            Make a contribution
          </button>
        }
      />
      {!member?.verified && (
        <div className="inline-note">
          <ShieldCheck />
          <span>
            Your community must verify your membership before you can
            contribute.
          </span>
        </div>
      )}
      {policies.length ? (
        <div className="policy-list">
          {policies.map((p) => (
            <section className="panel policy-record" key={p.id}>
              <ShieldCheck size={27} />
              <div>
                <span className="section-note">
                  {member?.community_name ?? "Cooperative"} / Policy #{p.id}
                </span>
                <h2>Your community protection</h2>
                <p>
                  {new Date(p.start * 1000).toLocaleDateString()} –{" "}
                  {new Date(p.end * 1000).toLocaleDateString()}
                </p>
              </div>
              <div>
                <small>Remaining coverage</small>
                <strong>
                  {money(formatUnits(BigInt(p.limit) - BigInt(p.used), 6))} USDC
                </strong>
                <Status
                  status={
                    p.end * 1000 > Date.now()
                      ? "Coverage active"
                      : "Coverage expired"
                  }
                />
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <ShieldCheck size={30} />
          <h3>Your first contribution starts your coverage.</h3>
          <p>
            Read the community terms, verify your membership and approve the
            contribution from your wallet.
          </p>
          <Link href="/app/communities" className="text-link">
            Understand the terms <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
      <ContributionRouteProof />
    </>
  );
}
function NewClaim({
  policies,
  busy,
  create,
}: {
  policies: Policy[];
  busy: boolean;
  create: (data: Record<string, unknown>) => void;
}) {
  return (
    <>
      <PageHeading
        title="Tell us what happened."
        description="Start one case. Your documents and every follow-up will stay together."
      />
      <form
        className="panel form-stack claim-form"
        onSubmit={(e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.currentTarget));
          create({
            ...data,
            incidentDate: new Date(String(data.incidentDate)).toISOString(),
          });
        }}
      >
        <div className="inline-note">
          <LockKeyhole size={18} />
          <span>
            Use synthetic documents only in this testnet demo. Your claim
            details stay private.
          </span>
        </div>
        <label>
          Your coverage
          <select name="policyId" required>
            <option value="">Choose a policy</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                Policy #{p.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          A short description
          <input
            name="title"
            required
            minLength={4}
            maxLength={120}
            placeholder="For example, eye surgery reimbursement"
          />
        </label>
        <div className="form-columns">
          <label>
            Date and time of treatment
            <input
              type="datetime-local"
              name="incidentDate"
              required
              max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 16)}
            />
          </label>
          <label>
            Requested support (USDC)
            <input
              type="number"
              min="0.000001"
              step="0.000001"
              name="requestedAmount"
              required
              placeholder="0.00"
            />
          </label>
        </div>
        <label>
          What should reviewers understand?
          <textarea
            name="description"
            minLength={10}
            maxLength={3000}
            rows={5}
            required
            placeholder="Explain the treatment and the support you are requesting."
          />
        </label>
        <div className="form-footer">
          <span>You can add documents in the next step.</span>
          <button
            className="button button-lime"
            disabled={busy || !policies.length}
          >
            Create my case <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </>
  );
}
type Run = (fn: () => Promise<unknown>, message?: string) => Promise<void>;
