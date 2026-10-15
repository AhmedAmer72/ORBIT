import { motion, useReducedMotion } from "motion/react";
import GradientButton from "@/components/ui/button-1";

type FrameProps = {
  src?: string;
  label: string;
  className?: string;
};

function ArtFrame({ src, label, className = "" }: FrameProps) {
  return (
    <div className={`overflow-hidden rounded-[28px] bg-[#d9cfc3] ${className}`}>
      {src ? (
        <img src={src} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-start bg-[linear-gradient(165deg,#f3eadf_0%,#d7c4ae_42%,#9aa7b5_100%)] p-5">
          <span className="text-xs tracking-wide text-black/45">{label}</span>
        </div>
      )}
    </div>
  );
}

export function GalleryHero({
  primarySrc,
  secondarySrc,
}: {
  primarySrc?: string;
  secondarySrc?: string;
}) {
  const reduce = useReducedMotion();
  const rise = (delay: number, x = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: x ? 0 : 18, x },
          animate: { opacity: 1, y: 0, x: 0 },
          transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <section className="relative min-h-screen bg-[#070707]">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-14 px-6 pt-28 pb-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8">
        <div>
          <motion.p className="text-xs font-medium tracking-[0.18em] text-white/45 uppercase" {...rise(0.05)}>
            On-chain authorization
          </motion.p>
          <motion.h1
            className="mt-5 max-w-xl font-serif text-5xl leading-[1.02] font-medium tracking-tight text-white sm:text-6xl"
            {...rise(0.12)}
          >
            Give agents permission, not control.
          </motion.h1>
          <motion.p className="mt-5 max-w-md text-base leading-7 text-white/55" {...rise(0.22)}>
            Orbit lets an autonomous agent pay only inside limits a smart contract enforces. You define the rules. The vault keeps the funds.
          </motion.p>
          <motion.div className="mt-8 flex items-center gap-5" {...rise(0.32)}>
            <GradientButton to="/app" width="168px" height="52px">
              Launch App
            </GradientButton>
            <a href="#how" className="text-sm text-white/80 no-underline hover:text-white">
              See how it works
            </a>
          </motion.div>
        </div>
        <div className="relative mx-auto h-[520px] w-full max-w-[480px] sm:h-[580px]">
          <motion.div className="absolute inset-x-4 top-0 h-[84%]" {...rise(0.2, 28)}>
            <ArtFrame src={primarySrc} label="Add the primary image" className="h-full shadow-[0_30px_80px_rgba(0,0,0,0.45)]" />
          </motion.div>
          <motion.div className="absolute right-0 bottom-2 h-[46%] w-[58%]" {...rise(0.38, 36)}>
            <ArtFrame
              src={secondarySrc}
              label="Add the second image"
              className="h-full shadow-[0_24px_50px_rgba(0,0,0,0.5)] ring-[10px] ring-[#070707]"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
