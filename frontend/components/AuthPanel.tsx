"use client";
import { useState } from "react";
import Link from "next/link";
import BrandMark from "./BrandMark";
import {
  ArrowLeft,
  ArrowUpRight,
  Wallet,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
import { signInWithWallet } from "../lib/wallet";
export default function AuthPanel({ signup = false }: { signup?: boolean }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function connect() {
    setBusy(true);
    setError("");
    try {
      const result = await signInWithWallet();
      location.assign(
        result.member.name === "New member" ? "/app/onboarding" : "/app",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-visual">
        <img
          src="/images/community-dusk.webp"
          alt="Kerala backwaters at dusk"
        />
        <Link href="/" className="brand">
          <span className="brand-mark">
            <BrandMark />
          </span>
          GuardLink
        </Link>
        <div>
          <span className="hero-label">A little from each of us.</span>
          <h1>
            A stronger
            <br />
            place to stand.
          </h1>
          <p>
            Member-owned protection.
            <br />
            Rooted in community.
          </p>
        </div>
        <small>Illustrative artwork · Testnet prototype</small>
      </section>
      <section className="auth-form">
        <Link className="back-link" href="/">
          <ArrowLeft size={17} /> Back to GuardLink
        </Link>
        <div className="auth-content">
          <span className="section-note">Protection, together.</span>
          <h2>
            {signup ? "Your community starts here." : "Good to have you here."}
          </h2>
          <p>
            {signup
              ? "Create your account to explore the community and understand your coverage."
              : "Sign in to follow your coverage, claims and community."}
          </p>
          <div className="auth-options">
            <button
              className="button button-lime full-width"
              disabled={busy}
              onClick={connect}
            >
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Wallet size={18} />
              )}{" "}
              {busy ? "Waiting for your signature…" : "Continue with wallet"}
              <ArrowUpRight size={17} />
            </button>
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="auth-assurance">
            <ShieldCheck size={18} />
            <p>
              A sign-in signature does not authorize a payment. You approve
              financial actions separately.
            </p>
          </div>
          <p className="auth-switch">
            {signup ? "Already part of the community?" : "New to GuardLink?"}{" "}
            <Link href={signup ? "/login" : "/signup"}>
              {signup ? "Sign in" : "Get started"}
            </Link>
          </p>
        </div>
        <div className="auth-bottom">
          <Link href="/privacy">Privacy and your documents</Link>
          <Link href="/ledger">Public ledger</Link>
          <span>Testnet only</span>
        </div>
      </section>
    </main>
  );
}
