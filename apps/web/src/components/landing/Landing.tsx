import { Bot, Receipt, Shield, Vault } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";

import { PolicyDemo } from "@/components/landing/PolicyDemo";
import { SiteNav } from "@/components/landing/SiteNav";
import { Hero } from "@/components/ui/hero-1";
import SkewCards, { SkewFace } from "@/components/ui/gradient-card-showcase";
import { Reveal } from "@/components/motion/Reveal";
import Carousel from "@/components/ui/Carousel";
import GradientButton from "@/components/ui/button-1";
import { Footer } from "@/components/ui/footer";

const code = `import { encodeExecutePayment, paymentIdFromLabel, simulateVaultCall } from "@arcbond/sdk";

const data = encodeExecutePayment(recipient, amount, paymentIdFromLabel("invoice-1"));
const preview = await simulateVaultCall({ publicClient, account: agent, vault, data });`;

const screen = "flex min-h-svh flex-col justify-center";
const flowSteps = [
  {
    title: "Human defines policies",
    body: "The owner sets the per-payment cap, the UTC-day cap, the allowlist, and the expiry. The agent does not write these rules.",
  },
  {
    title: "Agent requests payment",
    body: "The agent names an amount, a recipient, and a payment id. The request does nothing until the vault accepts it.",
  },
  {
    title: "Contract evaluates limits",
    body: "The vault checks the cap, the day's total, the allowlist, expiry, and whether that payment id was already used.",
  },
  {
    title: "Payment executes or reverts",
    body: "USDC moves only when every check passes. A failed check reverts, and the balance stays where it was.",
  },
];
const night = [
  ["#0b1c38", "#60a5fa"],
  ["#10243f", "#2563eb"],
  ["#07111f", "#93c5fd"],
] as const;
const day = [
  ["#1d4ed8", "#93c5fd"],
  ["#1e3a8a", "#38bdf8"],
  ["#2563eb", "#0d1b30"],
  ["#1d4ed8", "#22d3ee"],
] as const;
const risks = [
  ["Unrestricted spending", "A key with no cap can send the whole balance in one call."],
  ["Unauthorized recipients", "Without an allowlist, the agent chooses any destination."],
  ["Repeated payments", "The same request can settle twice unless each payment id is consumed."],
] as const;
const howSteps = [
  {
    id: "vault",
    title: "Create a vault",
    description: "The owner deploys a vault and deposits USDC. That balance is the only money an agent can spend.",
    icon: <Vault size={16} strokeWidth={1.8} />,
  },
  {
    id: "policy",
    title: "Define spending policies",
    description: "Set a per-payment maximum, a UTC-day cap, an expiry, and the recipient allowlist. An empty allowlist rejects every payment.",
    icon: <Shield size={16} strokeWidth={1.8} />,
  },
  {
    id: "agent",
    title: "Authorize an agent",
    description: "One agent address can submit payments until the owner revokes it or the expiry time passes.",
    icon: <Bot size={16} strokeWidth={1.8} />,
  },
  {
    id: "verify",
    title: "Execute and verify payments",
    description: "The agent submits the payment. It counts only after PaymentExecuted and a successful receipt.",
    icon: <Receipt size={16} strokeWidth={1.8} />,
  },
];
const arcCarousel = {
  "--carousel-frame": "rgba(8, 22, 46, 0.72)",
  "--carousel-frame-edge": "rgba(147, 197, 253, 0.22)",
  "--carousel-frame-highlight": "rgba(186, 230, 253, 0.16)",
  "--carousel-frame-shadow": "0 22px 44px -20px rgba(2, 8, 23, 0.75)",
  "--carousel-tile": "linear-gradient(180deg, #1a4488 0%, #0b1c38 100%)",
  "--carousel-tile-edge": "rgba(147, 197, 253, 0.22)",
  "--carousel-tile-highlight": "rgba(224, 242, 254, 0.2)",
  "--carousel-tile-shadow": "0 10px 24px -12px rgba(2, 8, 23, 0.8)",
  "--carousel-ink": "#f8fafc",
  "--carousel-muted": "rgba(226, 232, 240, 0.74)",
  "--carousel-faint": "rgba(147, 197, 253, 0.35)",
  "--carousel-soft": "rgba(147, 197, 253, 0.55)",
  "--carousel-badge": "rgba(147, 197, 253, 0.16)",
} as CSSProperties;
const rules = [
  "Per-transaction maximum",
  "Cumulative cap inside the current UTC day",
  "Approved-recipient restriction",
  "Single-agent authorization and revocation",
  "Exclusive expiry timestamp",
  "Duplicate payment-id rejection",
];

export function Landing() {
  const reduce = useReducedMotion();

  return (
    <div className="landing-page bg-[#070707]">
      <SiteNav />
      <main>
        <Hero
          eyebrow="Live on Arc mainnet"
          eyebrowHref="https://explorer.arc.io"
          eyebrowLogo="/arc-mark.png"
          title={"Agents may pay.\nThey never rule."}
          subtitle="Autonomous agents can pay only inside limits a smart contract enforces on Arc mainnet. You define the rules. The vault keeps the funds."
          ctaLabel="Launch App"
          ctaHref="/app"
          secondaryLabel="See how it works"
          secondaryHref="#how"
        />

        <section className={`band-b ${screen}`}>
          <div className="mx-auto w-full max-w-6xl px-6 py-24">
            <h2 className="max-w-2xl font-serif text-4xl font-medium tracking-tight sm:text-5xl">
              Autonomy without boundaries is a risk.
            </h2>
            <div className="mt-8 grid items-stretch gap-8 md:grid-cols-3">
              {risks.map(([title, body], index) => (
                <SkewFace
                  key={title}
                  compact
                  kicker={`0${index + 1}`}
                  title={title}
                  desc={body}
                  gradientFrom={night[index]![0]}
                  gradientTo={night[index]![1]}
                />
              ))}
            </div>
          </div>
        </section>

        <AuthorityStory />

        <section id="product" className={`band-b ${screen}`}>
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-24 lg:grid-cols-2">
          <Reveal>
            <h2 className="font-serif text-4xl font-medium tracking-tight">See a rule fail before you fund a vault.</h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/55">
              Orbit is live on Arc mainnet. Create a vault in the app and check a payment before you fund it. A simulation does not move USDC. Sending a payment does, and only the authorized agent can send it.
            </p>
          </Reveal>
          <SkewFace compact stable gradientFrom={night[1][0]} gradientTo={night[1][1]}>
            <PolicyDemo />
          </SkewFace>
          </div>
        </section>

        <section className={`band-a overflow-x-clip ${screen} px-4`}>
          <Reveal>
            <h2 className="mx-auto max-w-3xl px-4 text-center font-serif text-4xl font-medium tracking-tight">Three boundaries. One vault.</h2>
          </Reveal>
          <SkewCards />
        </section>

        <section id="security" className={`band-b ${screen}`}>
          <div className="mx-auto w-full max-w-6xl px-6 py-24">
          <motion.h2
            className="max-w-3xl font-serif text-4xl font-medium tracking-tight sm:text-5xl"
            initial={reduce ? undefined : { opacity: 0, clipPath: "inset(0 40% 0 0)" }}
            whileInView={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            Rules enforced by code. Not just prompts.
          </motion.h2>
          <ul className="mt-10 grid items-stretch gap-8 sm:grid-cols-2">
            {rules.map((item, index) => (
              <motion.li
                key={item}
                className="list-none"
                initial={reduce ? undefined : { opacity: 0, scale: 0.96 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
              >
                <SkewFace
                  compact
                  kicker={`0${index + 1}`}
                  title={item}
                  gradientFrom={night[index % night.length]![0]}
                  gradientTo={night[index % night.length]![1]}
                />
              </motion.li>
            ))}
          </ul>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-white/50">
            Pause blocks agent payments. The owner can still withdraw. This is not an audit certification or a guarantee against every operational mistake.
          </p>
          </div>
        </section>

        <HowItWorks />

        <section id="developers" className={`band-b ${screen}`}>
          <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-6 py-24 lg:grid-cols-2">
          <Reveal y={0}>
            <h2 className="font-serif text-4xl font-medium tracking-tight">Infrastructure developers can build on.</h2>
            <p className="mt-4 text-sm leading-6 text-white/55">
              The snippet uses the local SDK. It does not submit a transaction from this page.
            </p>
            <div className="mt-5 flex gap-4 text-sm">
              <Link to="/sdks">SDK documentation</Link>
              <Link to="/app/docs">Contract interface</Link>
            </div>
          </Reveal>
          <motion.div
            initial={reduce ? undefined : { opacity: 0, filter: "blur(8px)" }}
            whileInView={{ opacity: 1, filter: "blur(0px)" }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <SkewFace compact stable gradientFrom={night[0][0]} gradientTo={night[0][1]}>
              <pre className="overflow-x-auto text-xs leading-6 text-sky">{code}</pre>
            </SkewFace>
          </motion.div>
          </div>
        </section>

        <section className={`band-a ${screen}`}>
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-24 lg:grid-cols-2">
          <div>
            <h2 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">Autonomy needs boundaries.</h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/55">
              Build autonomous payment workflows on Arc mainnet, with explicit permissions and on-chain enforcement.
            </p>
            <div className="mt-6 flex items-center gap-5">
              <GradientButton to="/app" width="190px" height="52px">
                Launch Orbit
              </GradientButton>
              <Link to="/app/docs" className="text-sm text-white/80 no-underline">
                Read the documentation
              </Link>
            </div>
          </div>
          <GalleryHeroFrames />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function AuthorityStory() {
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
  const [index, setIndex] = useState(0);
  const line = useTransform(scrollYProgress, [0, 1], reduce ? ["100%", "100%"] : ["0%", "100%"]);
  const step = flowSteps[index] ?? flowSteps[0]!;

  useEffect(() => {
    if (reduce) return undefined;
    return scrollYProgress.on("change", (value) => {
      const next = Math.min(flowSteps.length - 1, Math.max(0, Math.floor(value * flowSteps.length)));
      setIndex((current) => (current === next ? current : next));
    });
  }, [reduce, scrollYProgress]);

  return (
    <section ref={trackRef} className="band-a" style={reduce ? undefined : { height: `${flowSteps.length * 100}vh` }}>
      <div className={reduce ? screen : "sticky top-0 flex min-h-svh items-center overflow-hidden"}>
        <div className="relative mx-auto w-full max-w-6xl px-6 py-24">
          <p className="font-mono text-xs tracking-[0.22em] text-sky uppercase">The path</p>
          <h2 className="mt-4 max-w-4xl font-serif text-4xl font-medium tracking-tight sm:text-6xl">
            Human authority. Autonomous execution.
          </h2>
          <AnimatePresence mode="wait">
            <motion.div
              key={step.title}
              className="mt-12 grid items-end gap-8 lg:grid-cols-[9rem_minmax(0,1fr)]"
              initial={reduce ? false : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -20 }}
              transition={{ duration: 0.35 }}
            >
              <p className="font-serif text-7xl leading-none text-white sm:text-8xl">0{index + 1}</p>
              <div>
                <h3 className="text-3xl tracking-tight sm:text-4xl">{step.title}</h3>
                <p className="mt-4 max-w-xl text-base leading-7 text-white/65">{step.body}</p>
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="relative mt-16">
            <div className="h-px bg-white/15" />
            <motion.div className="absolute top-0 left-0 h-px bg-sky" style={{ width: line }} />
            <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {flowSteps.map((item, stepIndex) => (
                <li key={item.title} className={stepIndex === index ? "text-white" : "text-white/40"}>
                  <span className="font-mono text-xs text-sky">{stepIndex + 1}</span>
                  <p className="mt-2 text-sm">{item.title}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLElement>(null);
  const indexRef = useRef(0);
  const fromScroll = useRef(false);
  const settleRef = useRef<number | null>(null);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
  const [index, setIndex] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const line = useTransform(scrollYProgress, [0, 1], reduce ? ["100%", "100%"] : ["0%", "100%"]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reduce) return undefined;
    return scrollYProgress.on("change", (value) => {
      const next = Math.min(howSteps.length - 1, Math.max(0, Math.floor(value * howSteps.length)));
      if (settleRef.current != null) {
        if (next !== settleRef.current) return;
        settleRef.current = null;
      }
      if (next === indexRef.current) return;
      fromScroll.current = true;
      indexRef.current = next;
      setIndex(next);
    });
  }, [reduce, scrollYProgress]);

  function scrollToStep(next: number) {
    const section = trackRef.current;
    if (!section || reduce) return;
    settleRef.current = next;
    window.setTimeout(() => {
      if (settleRef.current === next) settleRef.current = null;
    }, 900);
    const start = section.getBoundingClientRect().top + window.scrollY;
    const distance = Math.max(0, section.offsetHeight - window.innerHeight);
    const mid = (next + 0.5) / howSteps.length;
    window.scrollTo({ top: start + distance * mid, behavior: "smooth" });
  }

  function selectStep(next: number) {
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
    scrollToStep(next);
  }

  return (
    <section
      id="how"
      ref={trackRef}
      className="band-a scroll-mt-24"
      style={reduce ? undefined : { height: `${howSteps.length * 80}vh` }}
    >
      <div className={reduce ? `w-full ${screen}` : "sticky top-0 flex min-h-svh items-center"}>
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,440px)] lg:py-16">
          <div>
            <p className="font-mono text-xs text-sky">
              Step {index + 1} of {howSteps.length}
            </p>
            <h2 className="mt-3 font-serif text-3xl font-medium tracking-tight sm:text-5xl">How it works</h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/60">
              {reduce
                ? "Move through the path from a new vault to a verified payment."
                : "Scroll to move from a new vault to a verified payment."}
            </p>
            <div className="mt-6 h-px w-40 overflow-hidden bg-white/15">
              <motion.div className="h-full origin-left bg-sky" style={{ width: line }} />
            </div>
            <ol className="mt-6 hidden gap-2 lg:grid">
              {howSteps.map((step, stepIndex) => (
                <li key={step.id}>
                  <button
                    type="button"
                    className={`text-left text-sm ${stepIndex === index ? "text-white" : "text-white/45"}`}
                    onClick={() => selectStep(stepIndex)}
                    aria-current={stepIndex === index ? "step" : undefined}
                  >
                    <span className="mr-3 font-mono text-xs text-sky">{stepIndex + 1}</span>
                    {step.title}
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <Carousel
            className="how-carousel"
            items={howSteps.map((step, stepIndex) => (
              <SkewFace
                key={step.id}
                fill
                stable
                kicker={`Step ${stepIndex + 1}`}
                title={step.title}
                desc={step.description}
                gradientFrom={day[stepIndex]![0]}
                gradientTo={day[stepIndex]![1]}
              />
            ))}
            index={index}
            baseWidth={420}
            aspectRatio={narrow ? 1.35 : 1.2}
            effect="tilt"
            indicator="dots"
            frame
            arrows={Boolean(reduce)}
            loop={false}
            autoplay={false}
            autoplayDelay={3000}
            pauseOnHover={false}
            draggable={Boolean(reduce)}
            theme="dark"
            radius={24}
            onChange={(next) => {
              if (fromScroll.current) {
                fromScroll.current = false;
                return;
              }
              selectStep(next);
            }}
            style={arcCarousel}
          />
        </div>
      </div>
    </section>
  );
}

function GalleryHeroFrames() {
  return (
    <div className="relative mx-auto h-[360px] w-full max-w-[420px]">
      <div className="absolute inset-x-6 top-0 h-[78%] overflow-hidden rounded-[28px] shadow-lift">
        <img
          src="/landing/agent-network.jpg"
          alt="Illustrated agent linked to identity, network, and control nodes"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="absolute right-0 bottom-0 h-[42%] w-[54%] overflow-hidden rounded-[24px] ring-[10px] ring-[var(--band)]">
        <img
          src="/landing/agent-interface.webp"
          alt="Wireframe hands shaping a circuit interface"
          className="h-full w-full object-cover"
        />
      </div>
    </div>
  );
}
