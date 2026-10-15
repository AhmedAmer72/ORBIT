import { motion, useTransform, type MotionValue } from "motion/react";

import GradientButton from "@/components/ui/button-1";

export function RayBackground({ progress }: { progress: MotionValue<number> }) {
  const arcScale = useTransform(progress, [0, 0.8], [1, 1.04]);
  const arcY = useTransform(progress, [0, 0.8], [0, -18]);
  const glowOpacity = useTransform(progress, [0, 0.75], [1, 0.62]);
  const rimScale = useTransform(progress, [0, 0.8], [1, 1.07]);
  const skyScale = useTransform(progress, [0, 0.8], [1, 1.035]);
  const midScale = useTransform(progress, [0, 0.8], [1, 1.015]);
  const deepScale = useTransform(progress, [0, 0.8], [1, 1]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden>
      <div className="absolute inset-0 bg-ink" />
      <motion.div
        className="absolute left-1/2 h-[1800px] w-[4000px] sm:w-[6000px]"
        style={{
          opacity: glowOpacity,
          x: "-50%",
          background:
            "radial-gradient(circle at center 800px, rgba(37, 99, 235, 0.72) 0%, rgba(37, 99, 235, 0.32) 14%, rgba(59, 130, 246, 0.16) 18%, rgba(147, 197, 253, 0.06) 22%, rgba(7, 17, 31, 0.2) 25%)",
        }}
      />
      <motion.div
        className="arc-glow absolute top-[58%] left-1/2 h-[1600px] w-[1600px] sm:top-[62%] sm:h-[2865px] sm:w-[3043px]"
        style={{ x: "-50%", y: arcY, rotate: 180, scale: arcScale }}
      >
        <motion.div
          className="absolute -mt-[13px] h-full w-full rounded-full"
          style={{
            background: "radial-gradient(43.89% 25.74% at 50.02% 97.24%, #12243c 0%, #07111f 100%)",
            border: "16px solid rgba(248, 250, 252, 0.9)",
            rotate: 180,
            scale: rimScale,
            zIndex: 5,
          }}
        />
        <motion.div
          className="absolute -mt-[11px] h-full w-full rounded-full bg-ink"
          style={{ border: "23px solid #93c5fd", rotate: 180, scale: skyScale, zIndex: 4 }}
        />
        <motion.div
          className="absolute -mt-[8px] h-full w-full rounded-full bg-ink"
          style={{ border: "23px solid #60a5fa", rotate: 180, scale: midScale, zIndex: 3 }}
        />
        <motion.div
          className="absolute -mt-[4px] h-full w-full rounded-full bg-ink"
          style={{ border: "23px solid #3b82f6", rotate: 180, scale: deepScale, zIndex: 2 }}
        />
        <motion.div
          className="absolute h-full w-full rounded-full bg-ink"
          style={{
            border: "20px solid #2563eb",
            boxShadow: "0 -15px 24.8px rgba(37, 99, 235, 0.55)",
            rotate: 180,
            zIndex: 1,
          }}
        />
      </motion.div>
    </div>
  );
}

function AnnouncementBadge({ text, href }: { text: string; href: string }) {
  return (
    <a
      href={href}
      className="relative inline-flex min-h-10 cursor-pointer items-center gap-2 overflow-hidden rounded-full px-5 py-2 text-sm text-white no-underline transition duration-300 hover:scale-[1.02] active:scale-[0.98] motion-reduce:transform-none"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))",
        backdropFilter: "blur(20px) saturate(140%)",
        boxShadow:
          "inset 0 1px rgba(255,255,255,0.2), inset 0 -1px rgba(0,0,0,0.1), 0 8px 32px -8px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 opacity-70 mix-blend-overlay"
        style={{ background: "radial-gradient(ellipse at center top, rgba(255, 255, 255, 0.15) 0%, transparent 70%)" }}
      />
      <span
        className="absolute -top-px left-1/2 h-[2px] w-[100px] -translate-x-1/2 opacity-60"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(37, 99, 235, 0.8) 20%, rgba(147, 197, 253, 0.85) 50%, rgba(59, 130, 246, 0.8) 80%, transparent 100%)",
          filter: "blur(0.5px)",
        }}
      />
      <svg width="16" height="16" viewBox="0 0 28 28" className="relative z-10" aria-hidden>
        <path d="M6 18.5C8 10 14 6 22 6" fill="none" stroke="#93C5FD" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="20.5" cy="16.5" r="2.2" fill="#F8FAFC" />
      </svg>
      <span className="relative z-10 font-medium text-white">{text}</span>
    </a>
  );
}

const heroCopy = {
  announcementText: "On-chain authorization infrastructure",
  announcementHref: "#security",
  title: "Agents may pay.",
  accent: "They never",
  ending: "rule.",
  subtitle:
    "Autonomous agents can pay only inside limits a smart contract enforces. You define the rules. The vault keeps the funds.",
};

export function HeroIntro() {
  return (
    <>
      <AnnouncementBadge text={heroCopy.announcementText} href={heroCopy.announcementHref} />
      <h1 className="hero-slogan mt-8 max-w-4xl text-[3.35rem] leading-[0.96] text-white sm:text-[4.6rem]">
        <span className="block">{heroCopy.title}</span>
        <span className="block">{heroCopy.accent} {heroCopy.ending}</span>
      </h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-white/60 sm:text-lg">{heroCopy.subtitle}</p>
    </>
  );
}

export function HeroActions() {
  return (
    <>
      <GradientButton to="/app" width="168px" height="52px">
        Launch App
      </GradientButton>
      <a href="#how" className="text-sm whitespace-nowrap text-white/80 no-underline hover:text-white">
        See how it works
      </a>
    </>
  );
}

export function BoltStyleChat() {
  return (
    <section className="relative h-svh w-full overflow-hidden bg-ink">
      <StaticRays />
      <div className="relative z-10 flex h-full -translate-y-16 flex-col items-center justify-center px-4 pt-24 text-center sm:-translate-y-24">
        <HeroIntro />
      </div>
      <div className="absolute bottom-[16%] left-1/2 z-10 flex w-[min(100%,22rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-5 gap-y-3 px-4 sm:bottom-[18%] sm:w-auto">
        <HeroActions />
      </div>
    </section>
  );
}

function StaticRays() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden>
      <div className="absolute inset-0 bg-ink" />
      <div
        className="absolute left-1/2 h-[1800px] w-[4000px] -translate-x-1/2 sm:w-[6000px]"
        style={{
          background:
            "radial-gradient(circle at center 800px, rgba(37, 99, 235, 0.72) 0%, rgba(37, 99, 235, 0.32) 14%, rgba(59, 130, 246, 0.16) 18%, rgba(147, 197, 253, 0.06) 22%, rgba(7, 17, 31, 0.2) 25%)",
        }}
      />
      <div
        className="absolute top-[58%] left-1/2 h-[1600px] w-[1600px] sm:top-[62%] sm:h-[2865px] sm:w-[3043px]"
        style={{ transform: "translate(-50%) rotate(180deg)" }}
      >
        <div
          className="absolute -mt-[13px] h-full w-full rounded-full"
          style={{
            background: "radial-gradient(43.89% 25.74% at 50.02% 97.24%, #12243c 0%, #07111f 100%)",
            border: "16px solid rgba(248, 250, 252, 0.9)",
            transform: "rotate(180deg)",
            zIndex: 5,
          }}
        />
        <div
          className="absolute -mt-[11px] h-full w-full rounded-full bg-ink"
          style={{ border: "23px solid #93c5fd", transform: "rotate(180deg)", zIndex: 4 }}
        />
        <div
          className="absolute -mt-[8px] h-full w-full rounded-full bg-ink"
          style={{ border: "23px solid #60a5fa", transform: "rotate(180deg)", zIndex: 3 }}
        />
        <div
          className="absolute -mt-[4px] h-full w-full rounded-full bg-ink"
          style={{ border: "23px solid #3b82f6", transform: "rotate(180deg)", zIndex: 2 }}
        />
        <div
          className="absolute h-full w-full rounded-full bg-ink"
          style={{
            border: "20px solid #2563eb",
            boxShadow: "0 -15px 24.8px rgba(37, 99, 235, 0.55)",
            transform: "rotate(180deg)",
            zIndex: 1,
          }}
        />
      </div>
    </div>
  );
}
