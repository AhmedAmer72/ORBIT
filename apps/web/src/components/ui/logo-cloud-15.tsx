"use client";

import { motion, useAnimationFrame, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { useRef, type ReactNode } from "react";

import { BorderBeam } from "@/components/ui/logo-cloud-15-utils/border-beam";
import { Logo01, Logo02, Logo03, Logo04, Logo05, Logo06, Logo07, Logo08 } from "@/components/ui/logo-cloud-15-utils/logos";
import { Marquee } from "@/components/ui/logo-cloud-15-utils/marquee";

const BEAM_DURATION = 8;
const BEAM_SIZE = 100;

const controls = [Logo01, Logo02, Logo03, Logo04, Logo05, Logo06, Logo07, Logo08];

function SpreadLogo({
  index,
  progress,
  children,
}: {
  index: number;
  progress: MotionValue<number>;
  children: ReactNode;
}) {
  const from = 0.16 + index * 0.03;
  const opacity = useTransform(progress, [from, from + 0.1], [0, 1]);
  const y = useTransform(progress, [from, from + 0.14], [28, 0]);
  const x = useTransform(progress, [0.14, 0.52], [(index - 3.5) * -28, 0]);

  return (
    <motion.span className="inline-flex" style={{ opacity, x, y }}>
      {children}
    </motion.span>
  );
}

const LogoCloud = ({ progress }: { progress?: MotionValue<number> }) => {
  const reduce = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const waveSpanRef = useRef<HTMLSpanElement>(null);
  const startTimeRef = useRef<number | null>(null);

  useAnimationFrame((time) => {
    if (reduce) return;
    if (!(cardRef.current && textRef.current && waveSpanRef.current)) return;

    if (startTimeRef.current === null) {
      startTimeRef.current = time;
    }

    const elapsed = ((time - startTimeRef.current) / 1000) % BEAM_DURATION;
    const beamOffset = (elapsed / BEAM_DURATION) * 100;

    const cardRect = cardRef.current.getBoundingClientRect();
    const textRect = textRef.current.getBoundingClientRect();

    const width = cardRect.width;
    const height = cardRect.height;
    const perimeter = 2 * (width + height);
    if (perimeter <= 0) return;

    const textLeft = Math.max(0, textRect.left - cardRect.left);
    const textRight = Math.min(width, textRect.right - cardRect.left);
    const textStartPercent = (textLeft / perimeter) * 100;
    const textEndPercent = (textRight / perimeter) * 100;
    const spanWidth = textEndPercent - textStartPercent;
    const span = waveSpanRef.current;

    if (spanWidth <= 0) return;

    if (beamOffset >= textStartPercent && beamOffset <= textEndPercent) {
      const t = (beamOffset - textStartPercent) / spanWidth;
      span.style.backgroundPosition = `${95 - t * 90}% center`;
    } else if (beamOffset < textStartPercent) {
      span.style.backgroundPosition = "0% center";
    } else {
      span.style.backgroundPosition = "100% center";
    }
  });

  return (
    <section className={`mx-auto w-full max-w-6xl px-6 ${progress ? "py-4" : "py-16"}`} aria-label="Payment controls">
      <div
        ref={cardRef}
        className={`relative mx-auto rounded-lg border border-white/10 bg-[#07111f]/85 shadow-[0_30px_80px_rgba(2,8,23,0.45)] backdrop-blur-xl ${progress ? "max-w-5xl" : "max-w-4xl"}`}
      >
        <BorderBeam duration={BEAM_DURATION} size={BEAM_SIZE} borderWidth={2} colorFrom="#93c5fd" colorTo="#34d399" />

        <div className="absolute inset-x-0 top-0 flex -translate-y-1/2 items-center justify-center px-6 sm:px-10">
          <p
            ref={textRef}
            className="bg-[var(--band,#0c2348)] px-3 text-center text-lg font-medium tracking-tight text-white/80 sm:px-6 sm:text-xl"
          >
            <span
              ref={waveSpanRef}
              style={{
                backgroundImage:
                  "linear-gradient(90deg, currentColor 0%, currentColor 45%, #93c5fd 47%, #34d399 50%, #93c5fd 53%, currentColor 55%, currentColor 100%)",
                backgroundSize: "250% 100%",
                backgroundRepeat: "no-repeat",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundPosition: "0% center",
              }}
            >
              Checked before every payment <span className="max-sm:hidden">inside the vault</span>
            </span>
          </p>
        </div>

        <div className="grid">
          {progress ? (
            <div className="flex min-h-24 flex-wrap items-center justify-center gap-x-6 gap-y-3 px-6 py-8 pt-12 text-white/85 sm:flex-nowrap sm:gap-x-8 sm:px-10">
              {controls.map((Logo, index) => (
                <SpreadLogo key={Logo.name || index} index={index} progress={progress}>
                  <Logo />
                </SpreadLogo>
              ))}
            </div>
          ) : (
            <div className="flex min-w-0 items-center justify-center p-8 pt-12 text-white/70 sm:p-10">
              <Marquee className="mask-x-from-75% [--duration:20s] [--gap:2.5rem] [&_svg]:mr-0" pauseOnHover>
                <Logo01 />
                <Logo02 />
                <Logo03 />
                <Logo04 />
                <Logo05 />
                <Logo06 />
                <Logo07 />
                <Logo08 />
              </Marquee>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default LogoCloud;
