"use client";

import { ChevronRight } from "lucide-react";

import GradientButton from "@/components/ui/button-1";

interface HeroProps {
  eyebrow?: string;
  eyebrowHref?: string;
  eyebrowLogo?: string;
  title: string;
  subtitle: string;
  ctaLabel?: string;
  ctaHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}

export function Hero({
  eyebrow = "Innovate Without Limits",
  eyebrowHref = "#security",
  eyebrowLogo,
  title,
  subtitle,
  ctaLabel = "Explore Now",
  ctaHref = "#",
  secondaryLabel,
  secondaryHref,
}: HeroProps) {
  return (
    <section
      id="hero"
      className="relative mx-auto flex min-h-svh w-full flex-col items-center justify-center overflow-hidden bg-ink px-6 pt-24 text-center md:px-8"
    >
      <div
        className="absolute inset-0 -z-10 h-full w-full opacity-80 bg-[linear-gradient(to_right,rgba(147,197,253,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(147,197,253,0.14)_1px,transparent_1px)] bg-[size:6rem_5rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]"
      />

      <div
        className="hero-arc pointer-events-none absolute top-[78%] left-1/2 h-[1600px] w-[1600px] -translate-x-1/2 sm:h-[2200px] sm:w-[140%]"
        aria-hidden
      >
        <div className="absolute inset-0 rounded-[100%] border-[16px] border-white/90 bg-ink shadow-[0_-18px_50px_rgba(37,99,235,0.55)]" />
        <div className="absolute inset-0 rounded-[100%] border-[23px] border-sky/80" />
        <div className="hero-arc-sweep" />
      </div>

      <div className="relative z-20 flex -translate-y-10 flex-col items-center sm:-translate-y-16">
      {eyebrow ? (
        <a
          href={eyebrowHref}
          className="group no-underline"
          {...(eyebrowHref.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
        >
          <span className="mx-auto flex w-fit items-center justify-center gap-2 rounded-3xl border-[2px] border-white/10 bg-white/5 px-5 py-2 text-sm tracking-tight text-white/80 uppercase">
            {eyebrowLogo ? <img src={eyebrowLogo} alt="" className="h-7 w-7 rounded-sm object-contain" /> : null}
            {eyebrow}
            <ChevronRight className="ml-2 inline h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </span>
        </a>
      ) : null}

      <h1 className="hero-slogan animate-fade-in max-w-5xl py-6 text-5xl leading-[0.96] whitespace-pre-line text-white sm:text-6xl md:text-7xl lg:text-8xl">
        {title}
      </h1>

      <p className="animate-fade-in mb-10 max-w-2xl text-lg tracking-tight text-white/85 md:text-xl">
        {subtitle}
      </p>

      {ctaLabel ? (
        <div className="flex flex-wrap items-center justify-center gap-5">
          <GradientButton to={ctaHref.startsWith("/") ? ctaHref : undefined} width="168px" height="52px">
            {ctaLabel}
          </GradientButton>
          {secondaryLabel && secondaryHref ? (
            <a href={secondaryHref} className="text-sm text-white/80 no-underline hover:text-white">
              {secondaryLabel}
            </a>
          ) : null}
        </div>
      ) : null}
      </div>
    </section>
  );
}
