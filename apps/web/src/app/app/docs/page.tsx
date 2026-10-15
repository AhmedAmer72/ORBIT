import { Link } from "react-router-dom";

import { PageIntro, Surface } from "@/components/ui";
import { appConfig } from "@/lib/config";

const sdk = `import { encodeExecutePayment, paymentIdFromLabel, simulateVaultCall } from "@arcbond/sdk";

const data = encodeExecutePayment(recipient, amount, paymentIdFromLabel("invoice-1"));
const preview = await simulateVaultCall({ publicClient, account: agent, vault, data });`;

export default function DocsPage() {
  return (
    <article className="space-y-8">
      <PageIntro title="Developer docs">
        Orbit is an on-chain USDC spending-control layer on Arc mainnet. The vault contract is the security boundary.
        This page describes the configuration this app is compiled with and the behavior the contracts implement. The
        SDK surfaces are on the <Link to="/sdks">SDKs page</Link>.
      </PageIntro>

      <Surface>
        <h2 className="text-lg font-semibold">Getting started</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted">
          <li>Connect a wallet on the configured chain. This build uses chain {appConfig.chainId}.</li>
          <li>Create a vault from the factory. The clone initializes the connected account as owner.</li>
          <li>Approve and deposit USDC. The token uses 6 decimals.</li>
          <li>Set a per-payment cap, a UTC-day cap, an expiry, and at least one recipient.</li>
          <li>Authorize one agent address that is not the owner.</li>
          <li>The agent calls executePayment, or signs an intent that a relayer submits to executePaymentIntent.</li>
          <li>
            Intent signing is in the Agent SDK. Factory version 2 clones implement executePaymentIntent. Version 1 clones
            do not. A simulation is not an authorization.
          </li>
        </ol>
      </Surface>

      <div className="grid gap-4 md:grid-cols-2">
        <Surface>
          <h2 className="text-lg font-semibold">Network configuration</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>Chain ID: {appConfig.chainId}</li>
            <li className="break-all">RPC: {appConfig.rpcUrl}</li>
            <li>
              Explorer:{" "}
              <a href={appConfig.explorerUrl} target="_blank" rel="noreferrer">
                {appConfig.explorerUrl}
              </a>
            </li>
            <li className="break-all font-mono text-xs">USDC: {appConfig.usdc}</li>
            <li className="break-all font-mono text-xs">Vault factory: {appConfig.factory ?? "not configured"}</li>
            <li className="break-all font-mono text-xs">
              Workspace factory: {appConfig.workspaceFactory ?? "not configured"}
            </li>
          </ul>
          <p className="mt-3 text-sm leading-6 text-muted">
            {appConfig.chainId === 5042
              ? "This build points at Arc mainnet. The mainnet vault factory is version 2, so its clones implement executePaymentIntent. Explorer source verification was not submitted."
              : "This build is not pointed at Arc mainnet."}
          </p>
        </Surface>
        <Surface>
          <h2 className="text-lg font-semibold">Vault architecture</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            ArcBondVaultFactory deploys EIP-1167 clones of an immutable ArcBondVault. USDC is a constant at the official
            6-decimal address. The factory cannot move funds. There is no upgrade admin and no protocol fee.
          </p>
        </Surface>
      </div>

      <Surface>
        <h2 className="text-lg font-semibold">Authorization model</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
          <li>The owner sets policy, recipients, the agent, pause, and withdrawals.</li>
          <li>One agent address may pay. The owner cannot be that agent. The agent key is not the owner key.</li>
          <li>Anyone can deposit. Revocation clears the agent and the expiry.</li>
          <li>Expiry is exclusive: the call must occur before expiresAt.</li>
        </ul>
      </Surface>

      <Surface>
        <h2 className="text-lg font-semibold">Policy enforcement</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          executePayment checks, in order: the vault is not paused, the caller is the agent, the authorization has not
          expired, the amount is within the per-payment cap, the recipient is approved, the payment id is unused, and
          the UTC-day total still has room. executePaymentIntent checks the same spending rules after it verifies the
          agent’s EIP-712 signature, deadline, nonce, and policy version. The period is a fixed one-day window from
          00:00 UTC. Updating policy does not reset spentInPeriod or used payment ids. It does invalidate outstanding
          intents.
        </p>
      </Surface>

      <Surface>
        <h2 className="text-lg font-semibold">SDKs</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
          <li>Agent SDK: createArcBondClient reads a vault, simulates executePayment, and can submit only with a connected signer.</li>
          <li>Paywall SDK: createArcBondPaywall binds a quote. verifyPaywallSettlement requires PaymentExecuted, a used payment id, and a successful receipt.</li>
          <li>Workspace helpers expose the workspace ABI. evaluateGuardian scores facts the caller already read. A score is not a fraud finding.</li>
        </ul>
        <p className="mt-3 text-sm leading-6 text-muted">
          <Link to="/sdks">Open the SDKs page</Link> for the import samples. The package is not on npm.
        </p>
      </Surface>

      <Surface>
        <h2 className="text-lg font-semibold">Payment execution</h2>
        <pre className="mt-3 overflow-x-auto rounded-2xl border border-line bg-ink p-4 text-xs leading-6 text-sky">{sdk}</pre>
        <p className="mt-3 text-sm leading-6 text-muted">
          Simulate before sending. A successful simulation is not a confirmed payment. The agent script is npm run
          agent:pay and it signs only with AGENT_PRIVATE_KEY.
        </p>
      </Surface>

      <Surface>
        <h2 className="text-lg font-semibold">Error handling</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          Custom errors in the vault ABI are decoded in the SDK. A rejected wallet prompt, a simulation revert, and a
          mined transaction with a failed receipt are different states. Activity lists only logs the RPC returns.
        </p>
      </Surface>

      <Surface>
        <h2 className="text-lg font-semibold">Security assumptions and limitations</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
          <li>A compromised owner can withdraw funds and rewrite policy.</li>
          <li>Pause blocks executePayment and executePaymentIntent. The owner can still withdraw.</li>
          <li>An empty allowlist or a zero cap fails closed.</li>
          <li>Native gas uses 18 decimals. ERC-20 USDC uses 6. The app shows the ERC-20 balance once.</li>
          <li>This page is not an audit. The factory addresses above are the configured values. Source verification was not submitted.</li>
        </ul>
      </Surface>
    </article>
  );
}
