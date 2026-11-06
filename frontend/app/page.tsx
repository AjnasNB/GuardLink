import Link from "next/link";
import BrandMark from "../components/BrandMark";
import LandingMotion from "../components/LandingMotion";
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  Check,
  LockKeyhole,
} from "lucide-react";

const demoPayouts = [
  {
    caseId: "GL-DFD3E4F9",
    amount: "0.50",
    hash: "0x99b9ff5721caaf32b2263f9b13d0dbaf37ce9415a3ff2d01d12d35dd4ef8fb4f",
  },
  {
    caseId: "GL-BECA3842",
    amount: "0.40",
    hash: "0x9740c683d839971953d61afad540597c17ffee9a144864bc85e3ea1f271c7a99",
    appeal: true,
  },
  {
    caseId: "GL-377CFC03",
    amount: "0.25",
    hash: "0xd49c157356415074b0351ca974740dfb4878fca95575eb28dc79fbfa8a157f63",
  },
];
const arcReceipt = "https://testnet.arcscan.app/tx/";

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
          <a href="#results">Testnet results</a>
          <a href="#how">How it works</a>
          <a href="#jury">Jury &amp; appeals</a>
        </div>
        <Link className="button button-light" href="/login">
          Enter GuardLink <ArrowUpRight size={16} />
        </Link>
      </nav>
      <section className="hero">
        <img
          className="hero-image"
          src="/images/community-dusk.webp"
          alt="Illustration of neighbours walking toward a Kerala community house at dusk"
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
      <section id="story" className="story-section" aria-labelledby="story-title">
        <div className="story-intro">
          <div>
            <p className="section-note">Why I started</p>
            <h2 id="story-title">Insurance should protect a family.</h2>
          </div>
          <div className="story-copy">
            <blockquote>
              <p>
                “After my father’s eye surgery, we had the bills, the discharge
                summary and the prescriptions. Every visit brought another
                requirement. While our claim waited, our family borrowed.
              </p>
              <p>
                When the money finally came, it felt like we were being paid out
                of pity. I believed that protection was our right. That’s why I
                started GuardLink.”
              </p>
            </blockquote>
            <div className="founder-signature">
              <span className="avatar" aria-hidden="true">A</span>
              <span>
                Ajnas N B<small>Founder, GuardLink</small>
              </span>
            </div>
          </div>
        </div>
        <div className="story-progress" id="progress">
          <h3>A year of work. Here’s where we are.</h3>
          <div className="story-outreach">
            <p className="section-note">Community outreach reported by the founder</p>
            <dl>
              <div>
                <dt>Direct interactions</dt>
                <dd>10,000+</dd>
              </div>
              <div>
                <dt>Contacts collected from people who expressed interest</dt>
                <dd>2 lakh+</dd>
              </div>
            </dl>
          </div>
          <ol className="story-milestones">
            <li>
              <h4>Listening in Kerala</h4>
              <p>
                We spoke with families and people connected to Kudumbashree.
                We collected responses with consent from people who said they
                were willing to try GuardLink.
              </p>
            </li>
            <li>
              <h4>From prototype to Mumbai</h4>
              <p>
                The first cooperative prototype became a working testnet app
                with private evidence, community review, a separate appeal
                panel and payouts members can verify.
              </p>
            </li>
            <li>
              <h4>Running on testnet today</h4>
              <p>
                The Mumbai walkthrough follows completed claims, including one
                paid after appeal, and shows how members voted on future coverage.
              </p>
            </li>
          </ol>
          <div className="story-actions">
            <Link className="button button-lime" href="/login">
              Open the testnet app <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link className="button button-ghost" href="/transparency/?caseId=dfd3e4f9-9008-4e60-b420-f10ae15c5f81">
              View a public claim timeline <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
      <section id="results" className="results-section" aria-labelledby="results-title">
        <div className="results-intro">
          <h2 id="results-title">What we proved on testnet.</h2>
          <p>
            Three synthetic claims from the Mumbai demo reached confirmed payment.
            The Arc receipts show exactly what the pool paid.
          </p>
        </div>
        <dl className="results-metrics">
          <div>
            <dt>Claims paid</dt>
            <dd>{demoPayouts.length}</dd>
          </div>
          <div>
            <dt>Total paid in test USDC</dt>
            <dd>1.15</dd>
          </div>
          <div>
            <dt>Claim paid after appeal</dt>
            <dd>1</dd>
          </div>
          <div>
            <dt>Demo votes for future coverage</dt>
            <dd>9 of 9</dd>
          </div>
        </dl>
        <ul className="results-receipts" aria-label="Verified testnet claim payouts">
          {demoPayouts.map(({ caseId, amount, hash, appeal }) => (
            <li key={caseId}>
              <a href={`${arcReceipt}${hash}`}>
                <span>
                  {caseId}{appeal && <small>Paid after appeal</small>}
                </span>
                <strong>{amount} test USDC</strong>
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
        <a
          className="text-link results-governance"
          href={`${arcReceipt}0xab39a350cc31af20d2fd7954e3b6c117236eb88889f5f25ada9e3c5491479646`}
        >
          Verify the vote to raise future coverage from 5 to 6 test USDC
          <ArrowUpRight size={17} aria-hidden="true" />
        </a>
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
      <section id="jury" className="jury-section" aria-labelledby="jury-title">
        <div className="section-heading">
          <div>
            <span className="section-note">Jury &amp; appeals</span>
            <h2 id="jury-title">Three jurors review each claim.</h2>
          </div>
          <p>
            Jurors review the evidence privately. Members can follow public case
            milestones and check the payment receipt.
          </p>
        </div>
        <ol className="story-milestones jury-milestones">
          <li>
            <h3>Appoint the panel</h3>
            <p>
              The cooperative operator appoints three verified members. The
              contract excludes the claimant, their chosen helper and duplicate
              picks.
            </p>
          </li>
          <li>
            <h3>Sign the decision</h3>
            <p>
              Each juror signs their own vote. Two approvals for the same amount
              approve the claim. Two rejections reject it. If the round ends
              without a match, the claim stays unresolved.
            </p>
          </li>
          <li>
            <h3>Hear an independent appeal</h3>
            <p>
              A member has 72 hours to appeal a rejection once. Three different
              jurors hear it. In the demo, an appeal led to a confirmed 0.40
              test USDC payout.
            </p>
          </li>
        </ol>
        <p className="jury-note">
          Cooperative members vote separately on future coverage. Elected juror
          rosters and revocable delegation are planned.
        </p>
        <Link
          className="text-link"
          href="/transparency/?caseId=beca3842-52a4-4744-bde2-7033087bed3d"
        >
          Follow the appeal and payout <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </section>
      <section id="community" className="community-section">
        <div className="community-art" data-scene-motion>
          <img
            loading="lazy"
            src="/images/community-gathering.webp"
            alt="Illustration of women meeting to review paperwork together on a Kerala veranda"
          />
          <span className="image-caption">
            Illustration of a community review.
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
          <Link href="/governance/proposals">Public proposals</Link>
          <Link href="/ledger">Public transaction ledger</Link>
          <Link href="/transparency">Public case milestones</Link>
          <Link href="/privacy">Privacy</Link>
          <span>© 2026 GuardLink</span>
        </div>
      </footer>
    </main>
  );
}
