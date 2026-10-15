import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";

import { BoltStyleChat, HeroActions, HeroIntro, RayBackground } from "@/components/ui/bolt-style-chat";

const risks = [
  ["Unrestricted spending", "A key with no cap can send the whole balance in one call."],
  ["Unauthorized recipients", "Without an allowlist, the agent chooses any destination."],
  ["Repeated payments", "The same request can settle twice unless each payment id is consumed."],
] as const;

export function HeroScroll() {
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });
  const smooth = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 28,
    mass: 0.35,
    restDelta: 0.0004,
  });

  const copyOpacity = useTransform(smooth, [0.16, 0.42], [1, 0]);
  const copyY = useTransform(smooth, [0.16, 0.46], [0, -48]);
  const copyScale = useTransform(smooth, [0.16, 0.46], [1, 0.97]);
  const copyEvents = useTransform(smooth, (value): "none" | "auto" => (value > 0.36 ? "none" : "auto"));

  const actionOpacity = useTransform(smooth, [0.08, 0.24], [1, 0]);
  const actionY = useTransform(smooth, [0.08, 0.24], [0, 16]);
  const actionEvents = useTransform(smooth, (value): "none" | "auto" => (value > 0.2 ? "none" : "auto"));

  const veil = useTransform(smooth, [0.28, 0.7], [0, 0.18]);
  const panelY = useTransform(smooth, [0.18, 0.78], ["58%", "-12%"]);
  const panelOpacity = useTransform(smooth, [0.2, 0.38], [0, 1]);
  const hintOpacity = useTransform(smooth, [0, 0.1], [1, 0]);

  if (reduce) {
    return (
      <>
        <BoltStyleChat />
        <RiskSection />
      </>
    );
  }

  return (
    <section ref={trackRef} className="relative h-[220vh] bg-ink">
      <div className="sticky top-0 h-svh overflow-hidden">
        <RayBackground progress={smooth} />
        <motion.div className="pointer-events-none absolute inset-0 z-[12] bg-ink" style={{ opacity: veil }} />
        <motion.div
          className="relative z-30 h-full"
          style={{ opacity: copyOpacity, y: copyY, scale: copyScale, pointerEvents: copyEvents }}
        >
          <div className="flex h-full -translate-y-16 flex-col items-center justify-center px-4 pt-24 text-center sm:-translate-y-24">
            <HeroIntro />
          </div>
        </motion.div>
        <motion.div
          className="absolute bottom-[16%] left-1/2 z-30 flex w-[min(100%,22rem)] flex-wrap items-center justify-center gap-x-5 gap-y-3 px-4 sm:bottom-[18%] sm:w-auto"
          style={{ x: "-50%", opacity: actionOpacity, y: actionY, pointerEvents: actionEvents }}
        >
          <HeroActions />
        </motion.div>
        <motion.div className="absolute inset-x-0 bottom-0 z-20" style={{ y: panelY, opacity: panelOpacity }}>
          <RiskSection progress={smooth} />
        </motion.div>
        <motion.p
          aria-hidden
          className="pointer-events-none absolute bottom-6 left-1/2 z-30 font-mono text-[10px] tracking-[0.22em] text-white/45 uppercase"
          style={{ x: "-50%", opacity: hintOpacity }}
        >
          Scroll
        </motion.p>
      </div>
    </section>
  );
}

function RiskSection({ progress }: { progress?: MotionValue<number> }) {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-8 pb-16 sm:pb-20">
      {progress ? <RiskHeading progress={progress} /> : <StaticRiskHeading />}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {risks.map(([title, body], index) =>
          progress ? (
            <RiskCard key={title} index={index} title={title} body={body} progress={progress} />
          ) : (
            <StaticRiskCard key={title} index={index} title={title} body={body} />
          ),
        )}
      </div>
    </div>
  );
}

function StaticRiskHeading() {
  return (
    <h2 className="max-w-2xl font-serif text-4xl font-medium tracking-tight sm:text-5xl">
      Autonomy without boundaries is a risk.
    </h2>
  );
}

function RiskHeading({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0.22, 0.4], [0, 1]);
  const y = useTransform(progress, [0.22, 0.44], [20, 0]);
  return (
    <motion.h2 className="max-w-2xl font-serif text-4xl font-medium tracking-tight sm:text-5xl" style={{ opacity, y }}>
      Autonomy without boundaries is a risk.
    </motion.h2>
  );
}

function RiskCopy({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <>
      <p className="font-mono text-xs text-sky">0{index + 1}</p>
      <h3 className="mt-4 text-2xl">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-white/55">{body}</p>
    </>
  );
}

function StaticRiskCard({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
      <RiskCopy index={index} title={title} body={body} />
    </article>
  );
}

function RiskCard({
  index,
  title,
  body,
  progress,
}: {
  index: number;
  title: string;
  body: string;
  progress: MotionValue<number>;
}) {
  const start = 0.3 + index * 0.06;
  const opacity = useTransform(progress, [start, start + 0.16], [0, 1]);
  const y = useTransform(progress, [start, start + 0.2], [28, 0]);
  return (
    <motion.article
      className="rounded-[28px] border border-white/10 bg-[#07111f]/80 p-6 shadow-[0_24px_60px_rgba(2,8,23,0.35)] backdrop-blur-md"
      style={{ opacity, y }}
    >
      <RiskCopy index={index} title={title} body={body} />
    </motion.article>
  );
}
