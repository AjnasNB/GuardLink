import Link from "next/link";
import BrandMark from "../components/BrandMark";
import LandingMotion from "../components/LandingMotion";
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  Plus,
  Check,
  LockKeyhole,
} from "lucide-react";
export default function Home() {
  return (
    <main className="landing">
      <LandingMotion />
      <nav className="landing-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <BrandMark />
          </span>
          GuardLink
        </Link>
        <div className="nav-links">
          <a href="#story">Our reason</a>
          <a href="#how">How it works</a>
          <a href="#community">The community</a>
        </div>
        <Link className="button button-light" href="/login">
          Enter GuardLink <ArrowUpRight size={16} />
        </Link>
      </nav>
      <section className="hero">
        <img
          className="hero-image"
          src="/images/community-dusk.webp"
          alt="Illustrative Kerala community house beside the backwaters at dusk"
        />
        <div className="hero-shade" />
        <div className="hero-content">
          <div className="hero-label">
            <span className="live-dot" /> Rooted in community. Built for
            dignity.
          </div>
          <h1>
            Life happens.
            <br />
            We stand together.
          </h1>
          <p>
            Protection owned by the people it protects.
            <br />A clearer path from a hospital bill to help.
          </p>
          <div className="hero-actions">
            <Link href="/signup" className="button button-lime">
              Find your community <ArrowUpRight size={18} />
            </Link>
            <a href="#how" className="button button-ghost">
              See how it works <ArrowRight size={17} />
            </a>
          </div>
        </div>
        <div className="hero-bottom">
          <span>From Kerala, with purpose.</span>
          <span>
            Small contributions. Shared strength.{" "}
            <span className="scroll-arrow">↓</span>
          </span>
        </div>
      </section>
      <section id="story" className="story-section">
        <div className="section-note">A promise, made personal.</div>
        <div>
          <h2>
            Insurance should protect
            <br />a family.<span className="muted"> Not exhaust it.</span>
          </h2>
          <div className="story-copy">
            <p>
              “My father’s eye surgery is why I started building this. We had
              the bills, the discharge summary and the prescriptions. But every
              visit brought another requirement.”
            </p>
            <p>
              While our claim waited, our family borrowed. A year later, I am
              still working on the same problem, learning from women and
              families in Kerala’s Kudumbashree communities.
            </p>
            <p>
              GuardLink brings that spirit of looking after each other into a
              system where you can understand your coverage, follow your claim
              and see where the money goes.
            </p>
            <div className="founder-signature">
              <span className="avatar">A</span>
              <span>
                Ajnas N B<small>Founder, GuardLink</small>
              </span>
            </div>
          </div>
        </div>
      </section>
      <section id="how" className="how-section">
        <div className="section-heading">
          <div>
            <span className="section-note">Less chasing. More clarity.</span>
            <h2>
              One claim.
              <br />A path you can follow.
            </h2>
          </div>
          <p>
            Get treated where you trust. Share your evidence once. Every next
            step stays with the same case.
          </p>
        </div>
        <div className="steps">
          {[
            {
              n: "01",
              title: "Belong to a community",
              text: "Choose your cooperative, understand the terms and contribute to a fund you can follow.",
            },
            {
              n: "02",
              title: "Tell us what happened",
              text: "Share your documents privately. Your assistant organizes the evidence and asks clearly if anything is missing.",
            },
            {
              n: "03",
              title: "People make the decision",
              text: "Eligible community jurors review the case. Their votes and reasons form an accountable decision.",
            },
            {
              n: "04",
              title: "Follow the payment",
              text: "Approved support goes to your wallet. See the receipt, or request an independent appeal if the decision feels wrong.",
            },
          ].map((s) => (
            <article key={s.n}>
              <span className="step-number">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <span className="step-line" />
            </article>
          ))}
        </div>
      </section>
      <section id="community" className="community-section">
        <div className="community-art">
          <img
            loading="lazy"
            src="/images/community-gathering.webp"
            alt="Illustration of neighbours helping one another organize papers on a Kerala veranda"
          />
          <span className="image-caption">
            Illustrative artwork. A shared place to begin.
          </span>
        </div>
        <div className="community-copy">
          <span className="section-note">People protect people.</span>
          <h2>
            Your community.
            <br />
            Your say.
          </h2>
          <p>
            The people contributing to the fund help govern its rules. Clear
            coverage. Recorded decisions. An independent path to appeal.
          </p>
          <ul className="benefits">
            <li>
              <Check /> Member votes on coverage and contributions
            </li>
            <li>
              <Check /> Separate reviewers for an appeal
            </li>
            <li>
              <LockKeyhole /> Private documents, accountable process
            </li>
          </ul>
          <Link href="/app/communities" className="text-link">
            Explore the community <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <section className="closing">
        <ShieldCheck size={35} />
        <h2>
          Protection should feel
          <br />
          like a right.<span className="muted"> Not a favour.</span>
        </h2>
        <Link href="/signup" className="button button-lime">
          Take the first step <ArrowUpRight size={18} />
        </Link>
        <p>
          Testnet prototype. No real insurance coverage is sold through this
          demo.
        </p>
      </section>
      <footer className="footer">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <BrandMark />
          </span>
          GuardLink
        </Link>
        <span>Built for people. Built for dignity.</span>
        <div>
          <Link href="/app/transparency">Follow the fund</Link>
          <Link href="/privacy">Privacy</Link>
          <span>© 2026 GuardLink</span>
        </div>
      </footer>
    </main>
  );
}
