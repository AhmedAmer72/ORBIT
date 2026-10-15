import { Link } from "react-router-dom";

import { Footer } from "@/components/ui/footer";
import { SkewFace } from "@/components/ui/gradient-card-showcase";
import { SiteNav } from "@/components/landing/SiteNav";
import { arcMainnetFactory, arcMainnetWorkspaceFactory } from "@arcbond/sdk";

const kits = [
  {
    kicker: "01",
    title: "Agent SDK",
    from: "#1d4ed8",
    to: "#93c5fd",
    body: "Prepare, simulate, and submit a vault payment. The package does not hold a private key. A simulation is not a confirmed payment.",
    code: `import { createPublicClient, http } from "viem";
import { arcMainnetFactory, chainById, createArcBondClient, ARC_MAINNET_CHAIN_ID, ARC_MAINNET_RPC } from "@arcbond/sdk";

const chain = chainById(ARC_MAINNET_CHAIN_ID);
const publicClient = createPublicClient({ chain, transport: http(ARC_MAINNET_RPC) });
const arcbond = createArcBondClient({
  chainId: chain.id,
  publicClient,
  factory: arcMainnetFactory.factory,
});`,
  },
  {
    kicker: "02",
    title: "Paywall SDK",
    from: "#1e3a8a",
    to: "#38bdf8",
    body: "Bind a quote to one chain, vault, recipient, amount, and payment id. Delivery is proven only by PaymentExecuted, a used payment id, and a successful receipt.",
    code: `import { createArcBondPaywall, parseUsdc } from "@arcbond/sdk";

const paywall = createArcBondPaywall({
  chainId: 5042,
  vault,
  recipient,
  publicClient,
});
const quote = await paywall.createQuote({
  serviceId: "data-lookup",
  requestId: "req-1",
  amount: parseUsdc("0.50"),
});`,
  },
  {
    kicker: "03",
    title: "Workspace and Guardian",
    from: "#2563eb",
    to: "#0d1b30",
    body: "Workspaces reserve the same USDC an agent can spend. Guardian scores are heuristics. They are not fraud findings and they do not pause a vault.",
    code: `import { arcMainnetWorkspaceFactory, evaluateGuardian } from "@arcbond/sdk";

const factory = arcMainnetWorkspaceFactory.factory;
const alerts = evaluateGuardian(facts, Math.floor(Date.now() / 1000));`,
  },
] as const;

export function SdkPage() {
  return (
    <div className="landing-page bg-[#070707]">
      <SiteNav />
      <main>
        <section className="flex min-h-svh flex-col justify-center bg-ink px-6 pt-28 pb-16">
          <div className="mx-auto w-full max-w-6xl">
            <p className="font-mono text-xs tracking-[0.22em] text-sky uppercase">SDKs</p>
            <h1 className="mt-4 max-w-3xl font-serif text-4xl font-medium tracking-tight sm:text-6xl">
              One package. Three ways to talk to a vault.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/65">
              <span className="font-mono text-sky">@arcbond/sdk</span> is the workspace package in this repository. It is not published to npm.
              Mainnet vault factory {arcMainnetFactory.factory}. Workspace factory {arcMainnetWorkspaceFactory.factory}. Chain 5042.
            </p>
            <div className="mt-6 flex gap-4 text-sm">
              <Link to="/app/docs">Contract documentation</Link>
              <Link to="/app">Launch the app</Link>
            </div>
          </div>
        </section>
        <section className="band-a px-6 py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-3">
            {kits.map((kit) => (
              <SkewFace key={kit.title} compact kicker={kit.kicker} title={kit.title} desc={kit.body} gradientFrom={kit.from} gradientTo={kit.to}>
                <pre className="overflow-x-auto text-[11px] leading-5 text-sky">{kit.code}</pre>
              </SkewFace>
            ))}
          </div>
        </section>
        <section className="band-b px-6 py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-serif text-3xl font-medium tracking-tight">What the SDK will not do</h2>
            <ul className="mt-6 grid gap-3 text-sm leading-6 text-white/70">
              <li>It will not treat a signature, a relay status, or a transaction hash as delivery.</li>
              <li>Session settlement emits PaymentExecuted but does not set usedPaymentIds. The paywall helper is for one-shot payment ids.</li>
              <li>Version 1 vaults have no executePaymentIntent. Mainnet clones from the version 2 factory do.</li>
              <li>The paywall example and the payments relay are local processes. They are not a hosted mainnet service.</li>
            </ul>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
