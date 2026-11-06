"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { api, type CommunityProfile, type Member } from "../lib/api";
import { joinCommunity } from "../lib/contracts";
import { PageHeading } from "./WorkspaceParts";

type Terms = { contribution: string; coverageLimit: string; termDays: number };
type Props = {
  member: Member | null;
  communityId?: string;
  poolAddress?: string;
  hasActiveCoverage: boolean;
  busy: boolean;
  refreshAccount: () => Promise<void>;
  onContribute: (expectedContribution: string) => Promise<void>;
};

function CommunityCover() {
  return (
    <div className="community-cover">
      <img src="/images/community-dusk.webp" alt="Illustration of neighbours walking to a Kerala community house" />
      <span className="status-pill">Arc Testnet</span>
    </div>
  );
}

export default function Community({
  member, communityId, poolAddress, hasActiveCoverage, busy, refreshAccount, onContribute,
}: Props) {
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [terms, setTerms] = useState<Terms | null>(null);
  const [termsError, setTermsError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const next = await api<CommunityProfile>("/community");
    setProfile(next);
    return next;
  }, []);
  const loadTerms = useCallback(async () => {
    setTerms(null);
    setTermsError("");
    try {
      setTerms(await api<Terms>("/terms"));
    } catch {
      setTermsError("Coverage terms are temporarily unavailable.");
    }
  }, []);
  useEffect(() => {
    void load().catch((e: Error) => setError(e.message));
  }, [load]);
  useEffect(() => {
    if (communityId) void loadTerms();
  }, [communityId, loadTerms]);

  async function perform(action: () => Promise<void>) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setPending(false);
    }
  }

  function requestMembership() {
    if (!profile || !accepted || !poolAddress || !member?.wallet) return;
    void perform(async () => {
      await joinCommunity(poolAddress);
      try {
        await api("/community/join", {
          method: "POST",
          body: JSON.stringify({ acceptedCriteria: profile.joiningCriteria }),
        });
      } catch (e) {
        const latest = await load().catch(() => null);
        if (latest?.joiningCriteria !== profile.joiningCriteria) setAccepted(false);
        throw e;
      }
      setProfile({ ...profile, membership: "requested" });
      setNotice("Membership request submitted for operator review.");
      await load().catch(() => undefined);
    });
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    void perform(async () => {
      const updated = await api<Pick<CommunityProfile, "name" | "location" | "description" | "joiningCriteria">>(
        "/organizer/community", { method: "PATCH", body: JSON.stringify(fields) },
      );
      setProfile({ ...profile, ...updated });
      setAccepted(false);
      setEditing(false);
      setNotice("Community details saved.");
      await refreshAccount();
    });
  }

  if (!profile) return error ? (
    <div className="alert error" role="alert">{error}</div>
  ) : <p role="status">Loading the community…</p>;

  if (!communityId) return (
    <>
      <PageHeading title="My community" description="Open your cooperative to see its joining criteria, coverage and member decisions." />
      <Link className="community-directory-card" href={`/app/communities/${profile.id}`}>
        <CommunityCover />
        <div className="panel community-details">
          <span className="section-note">{profile.location}</span>
          <h2>{profile.name}</h2>
          <p>{profile.description}</p>
          <span className="text-link">Open community <ArrowUpRight size={17} aria-hidden="true" /></span>
        </div>
      </Link>
    </>
  );

  if (communityId !== profile.id) return (
    <>
      <PageHeading title="Community unavailable" description="Open the cooperative linked to your account." />
      <Link className="text-link" href="/app/communities">← My community</Link>
    </>
  );

  const verified = profile.membership === "verified";
  const requested = profile.membership === "requested";
  return (
    <>
      <Link className="back-link" href="/app/communities">← My community</Link>
      <PageHeading title={profile.name} description={profile.location} action={profile.canEdit ? (
        <button className="button button-outline" onClick={() => setEditing(!editing)} disabled={pending}>
          {editing ? "Close editor" : "Edit community details"}
        </button>
      ) : undefined} />
      {error && <p className="alert error" role="alert">{error}</p>}
      {notice && <p className="alert success" role="status">{notice}</p>}
      {editing && (
        <form className="panel form-stack community-profile-form" onSubmit={saveProfile}>
          <h2>Edit community details</h2>
          <label>Community name<input name="name" defaultValue={profile.name} required minLength={2} maxLength={80} /></label>
          <label>Location<input name="location" defaultValue={profile.location} required minLength={2} maxLength={100} /></label>
          <label>Description<textarea name="description" defaultValue={profile.description} rows={4} required minLength={10} maxLength={2000} /></label>
          <label>Joining criteria<textarea name="joiningCriteria" defaultValue={profile.joiningCriteria} rows={4} required minLength={10} maxLength={1000} /></label>
          <p className="subtle">Applicants see these criteria before requesting verification. Coverage terms are set separately by community vote.</p>
          <button className="button button-lime" disabled={pending}>{pending ? "Saving…" : "Save community details"}</button>
        </form>
      )}
      <div className="community-profile-grid">
        <div className="community-profile-card">
          <CommunityCover />
          <section className="panel community-details" aria-labelledby="community-about">
            <h2 id="community-about">About the cooperative</h2>
            <p className="community-description">{profile.description}</p>
            <div className="terms-row">
              <div><small>Contribution</small><strong>{terms ? `${terms.contribution} test USDC` : "—"}</strong></div>
              <div><small>Coverage limit</small><strong>{terms ? `${terms.coverageLimit} test USDC` : "—"}</strong></div>
              <div><small>Coverage term</small><strong>{terms ? `${terms.termDays} days` : "—"}</strong></div>
            </div>
            {termsError && <p className="error-text" role="alert">{termsError}</p>}
            <p className="subtle">These are the current Arc Testnet terms for a new policy.</p>
            <div className="community-actions">
              <Link href="/app/governance" className="text-link">Read community decisions <ArrowUpRight size={16} aria-hidden="true" /></Link>
              {verified && <button className="button button-outline" onClick={() => void loadTerms()} disabled={busy}>Refresh terms</button>}
            </div>
          </section>
        </div>
        <section className="panel form-stack community-join" aria-labelledby="community-join">
          <h2 id="community-join">Joining this cooperative</h2>
          <p className="community-description">{profile.joiningCriteria}</p>
          <ol className="community-join-steps">
            <li><strong>Request membership.</strong> Register your wallet on Arc Testnet.</li>
            <li><strong>Get verified.</strong> The operator reviews your request.</li>
            <li><strong>Contribute for coverage.</strong> Approve test USDC in your wallet, then confirm the contribution. The confirmed payment issues your policy.</li>
          </ol>
          {verified ? (
            <>
              <span className="status-pill good"><Check size={14} aria-hidden="true" /> Verified member</span>
              {hasActiveCoverage ? (
                <Link className="button button-lime" href="/app/coverage">View my coverage <ArrowUpRight size={17} aria-hidden="true" /></Link>
              ) : (
                <button className="button button-lime" disabled={busy || pending || !terms || !poolAddress} onClick={() => terms && void onContribute(terms.contribution)}>
                  {busy ? "Waiting for confirmation…" : terms ? `Contribute ${terms.contribution} test USDC` : "Contribute for coverage"}
                </button>
              )}
            </>
          ) : requested ? (
            <>
              <p className="inline-note">Your request is waiting for operator verification.</p>
              <button className="button button-outline" disabled={pending} onClick={() => void perform(async () => { await load(); await refreshAccount(); })}>
                {pending ? "Checking…" : "Refresh membership status"}
              </button>
            </>
          ) : member?.wallet ? (
            <>
              <label className="community-criteria-check">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} disabled={pending} />
                I’ve read and accept the joining criteria.
              </label>
              <button className="button button-lime" disabled={!accepted || pending || !poolAddress} onClick={requestMembership}>
                {pending ? "Confirming your request…" : "Request membership"}
              </button>
            </>
          ) : (
            <Link className="button button-lime" href="/login">Sign in with a wallet</Link>
          )}
          <p className="subtle">This cooperative uses test funds on Arc Testnet.</p>
        </section>
      </div>
    </>
  );
}
