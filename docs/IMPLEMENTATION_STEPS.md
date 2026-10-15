# ArcBond implementation steps

This file is the build log for the local MVP. It records what was implemented, in the order it was built, and where each piece lives. Planning notes stay in the other files under `docs/`. Product intent stays in `ArcBond_Project_Overview.md`.

Status at the end of this log: contracts, tests, SDK, agent script, dashboard, and marketing landing page are implemented. Factory version 2 is deployed on Arc Testnet at `0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793` and one intent payment has settled there. The older factory remains at `0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d` and cannot execute intents. The landing hero and the payment-controls section are one scroll scene. Disconnect clears both the Privy session and the wallet connector. Mainnet broadcast is out of scope.

## 1. Define the product before writing contracts

The product is an on-chain spending boundary for one agent, not an AI wallet.

- The owner funds an isolated USDC vault.
- The owner sets a policy: per-payment cap, UTC-day cap, optional recipient allowlist, exclusive expiry, and one authorized agent.
- The agent can request a payment. The vault contract accepts or reverts. Prompts are not the security boundary.
- The owner can pause agent payments, revoke the agent, withdraw, and transfer ownership with a two-step accept.

Network facts used everywhere (verified 13 October 2026):

| Field | Arc Testnet | Arc Mainnet |
| --- | --- | --- |
| Chain ID | `5042002` | `5042` |
| RPC | `https://rpc.testnet.arc.io` | `https://rpc.mainnet.arc.io` |
| Explorer | `https://explorer.testnet.arc.io` | `https://explorer.arc.io` |
| USDC | `0x3600000000000000000000000000000000000000` | same address |
| USDC decimals | 6 as ERC-20, 18 as native gas | same |

Those facts are written down in `docs/ARCBOND_NETWORK_CONFIGURATION.md` and coded in `packages/sdk/src/chain.ts`.

## 2. Lay out the repository

The repo is an npm workspace:

```
apps/web            Vite + React 19 dashboard and landing page
packages/sdk        TypeScript SDK used by the app and the agent script
services/payments   Local quote, relay, and delivery service
contracts           Solidity 0.8.30 vault, factory, tests, deploy script
scripts             forge wrapper, direct agent payment, intent agent, read-only preflight
docs                architecture, tests, intents, this log
```

Root scripts in `package.json`:

- `npm run dev` starts the web app.
- `npm run build`, `npm run typecheck`, and `npm run lint` run across workspaces.
- `npm test` runs the SDK and web unit tests.
- `npm run test:contracts` installs Foundry libs if needed, then runs Forge.
- `npm run test:contracts:fork` runs the live Arc Testnet USDC fork test.
- `npm run agent:pay` runs `scripts/agent-pay.ts`, the direct `executePayment` path.
- `npm run pay:api` starts the payments service on `http://127.0.0.1:8787`.
- `npm run pay:agent` runs `scripts/pay-per-api.ts`, the signed-intent path. It does not read `.env`.

`scripts/ensure-libs.mjs` clones OpenZeppelin v5.4.0 and forge-std v1.11.0 into `contracts/lib` when they are missing. `scripts/forge.mjs` calls Forge.

Environment variables live in the untracked root `.env`. Names and comments are in `.env.example`. Do not commit keys.

## 3. Write the vault and factory

Source:

- `contracts/src/ArcBondVault.sol`
- `contracts/src/ArcBondVaultFactory.sol`
- `contracts/src/interfaces/IArcBondVault.sol`
- `contracts/script/Deploy.s.sol`

The factory deploys a clone and calls `initialize(owner)`. The implementation constructor disables initializers so the logic contract itself cannot be taken over.

Owner actions:

- `deposit` pulls USDC with `safeTransferFrom`.
- `withdraw` is owner-only and still works while paused.
- `updatePolicy(maxPerPayment, periodLimit, expiresAt)` replaces the three numeric rules and bumps `policyVersion`.
- `setRecipient(recipient, approved)` maintains the allowlist. A recipient must be approved. An empty allowlist rejects every payment.
- `authorizeAgent` replaces the single agent and bumps `policyVersion`.
- `revokeAgent` clears the agent and bumps `policyVersion`.
- `pause` and `unpause` block agent payments only.
- `transferOwnership` plus `acceptOwnership` is the two-step handoff.

Agent action:

- `executePayment(recipient, amount, paymentId)` settles immediately from the agent key.
- `executePaymentIntent(intent, signature)` recovers an EIP-712 signer, checks the intent fields, then uses the same settlement path. Factory version 2 on Arc Testnet includes this function. Version 1 clones do not, and they cannot be upgraded.

Every successful payment goes through `_settle`:

1. The caller must be the authorized agent, or the recovered intent signer must be that agent.
2. The vault must not be paused.
3. `block.timestamp` must be strictly before `expiresAt`.
4. `amount` must be greater than zero and at most `maxPerPayment`.
5. The destination must be an approved recipient. An empty allowlist rejects every payment.
6. `paymentId` must not already be in `usedPaymentIds`. It is written before the token transfer.
7. The UTC day id is `block.timestamp / 1 days`. If the day changed, `spentInPeriod` resets, then the new total must stay within `periodLimit`.
8. USDC is transferred. The balance must drop by exactly `amount`, which rejects fee-on-transfer tokens.
9. `PaymentExecuted` is emitted with payer, recipient, amount, payment id, period id, and spent total.

Changing policy, agent, or pause state bumps `policyVersion`. An intent signed against an older version cannot settle. That is specified in `docs/INTENT_PAYMENTS.md`.

## 4. Test the contracts before trusting the UI

Tests:

- `contracts/test/ArcBondVault.t.sol` covers the owner and agent paths.
- `contracts/test/ArcBondIntent.t.sol` covers EIP-712 intents.
- `contracts/test/ArcBondSecurity.t.sol` covers fuzz and invariant cases.
- `contracts/test/fork/ArcUsdc.t.sol` talks to real Arc Testnet USDC.
- `contracts/test/mocks/MockUSDC.sol` supplies the local token, a wrong-decimals token, a short transfer, and a reentering token.

Security cases that are asserted, not just described:

- A direct USDC transfer into the vault does not grant spend authority.
- The agent cannot withdraw, change policy, change the allowlist, or replace itself.
- Pause blocks `executePayment` and still allows the owner to withdraw.
- The second use of a payment id reverts, including when an earlier attempt reverted.
- An unapproved recipient does not consume the payment id.
- Setting the first allowlist entry cannot be bypassed by a race on an empty list.
- Expiry is exclusive: a payment at exactly `expiresAt` reverts.
- Reentrancy through a malicious USDC is rejected.
- A token that transfers fewer units than requested is rejected.
- An intent signed by another key, or against another vault, recipient, token, amount, id, nonce, deadline, or policy version, reverts.
- Factory clones cannot be initialized twice.

What the tests do not claim is written in `docs/SECURITY_ASSUMPTIONS.md` and `docs/SECURITY_TESTING.md`. Passing tests are not an audit. The owner key, the agent key, Arc USDC, and the RPC are trusted. There is no rate limit beyond the daily cap. There is no recovery if the owner key is lost.

Run them with:

```bash
npm run test:contracts
npm run test:contracts:fork
```

## 5. Build the SDK the agent and the app share

`packages/sdk` is the only place that encodes vault calls.

| Module | Job |
| --- | --- |
| `chain.ts` | Arc mainnet and testnet chain objects, USDC address, 6 decimals |
| `constants.ts` | Shared numeric limits |
| `abi.ts` | Vault and factory ABIs |
| `arcbond.ts` | Read vault state and encode calls |
| `policy.ts` | Pure policy checks used by preflight and the landing demo |
| `intent.ts` | EIP-712 payment intent hashing and signing |
| `client.ts` | viem public client and `simulateVaultCall` |
| `fees.ts` | Read `eth_gasPrice` and `eth_feeHistory`, floor at 20 gwei |
| `format.ts` | USDC formatting |
| `errors.ts` | Revert decoding |

`simulateVaultCall` is the preflight. It runs `eth_call` as the agent and returns the revert name when the policy would fail. The dashboard and `scripts/agent-pay.ts` both use it before sending a transaction.

SDK behavior is covered by unit tests in `packages/sdk`. `npm test` runs them.

## 6. Add the agent script and the read-only check

`scripts/agent-pay.ts` is a second wallet. It does not load `.env`, so the owner key cannot leak into it by accident. Export the variables in the shell:

```bash
set AGENT_PRIVATE_KEY=0x...
set VAULT_ADDRESS=0x...
set RECIPIENT=0x...
set AMOUNT=0.5
set PAYMENT_ID=invoice-1
npm run agent:pay
```

The script checks the chain id, simulates the payment, then sends `executePayment` with a fee of at least 20 gwei. Gas on Arc is USDC.

`scripts/sdk-preflight.ts` is read-only. `npx tsx scripts/sdk-preflight.ts 0xYourVault` prints vault state and does not broadcast. Usage is also in `docs/AGENT_SDK.md`.

`scripts/testnet-scenarios.ts` is the manual Arc Testnet checklist for scenarios A through F: create, fund, allow, pay, reject a repeat, revoke.

## 7. Deploy the factory on Arc Testnet

Deploy steps, also in `README.md`:

1. Fund the deployer from the Circle faucet. Gas is testnet USDC.
2. Put `PRIVATE_KEY` only in the untracked `.env`. Use a different wallet for `AGENT_PRIVATE_KEY`.
3. Query `eth_gasPrice` and `eth_feeHistory`. Submit at least 20 gwei `maxFeePerGas`.
4. From `contracts/`, broadcast `script/Deploy.s.sol:Deploy` to `https://rpc.testnet.arc.io`.
5. Verify the factory and the implementation on Blockscout. Both constructors take no arguments.
6. Copy the factory address and deploy block into `.env`.

Two factories are on Arc Testnet:

| Generation | Factory | Deploy block | Intents |
| --- | --- | --- | --- |
| Version 1 | `0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d` | `67052589` | No |
| Version 2 | `0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793` | `67213321` | Yes |

`.env` points the app and the payments service at version 2. The version 1 row stays so old clones are not mistaken for intent vaults. The broadcast record is in section 18.

The UI shows a configuration-missing state only when `NEXT_PUBLIC_FACTORY_ADDRESS` is empty. It does not invent sample vaults or balances.

## 8. Build the dashboard

`apps/web` is Vite, React 19, TypeScript, and Tailwind CSS 4. The component folder is `apps/web/src/components`, with shadcn-style pieces in `apps/web/src/components/ui`. The Tailwind entry is `apps/web/src/index.css`. The `@` alias points at `apps/web/src`.

Routes in `apps/web/src/router.tsx`:

| Path | Screen |
| --- | --- |
| `/` | Marketing landing page |
| `/app` | Overview |
| `/app/vaults` | Create a vault, deposit, withdraw |
| `/app/policies` | Edit cap, daily limit, expiry, allowlist |
| `/app/agents` | Authorize one agent, or revoke it |
| `/app/activity` | Deposit, withdrawal, and payment events from the factory deploy block |
| `/app/pay` | Quote, sign an intent, and ask the provider for the record |
| `/app/docs` | In-app SDK and contract notes |

Older paths (`/vaults`, `/policy`, `/agents`, `/activity`, `/docs`, `/app/policy-lab`) redirect to the routes above.

Data flow:

- `src/lib/config.ts` reads `NEXT_PUBLIC_*` at startup. Under Vitest it reads `process.env` instead.
- `src/lib/wagmi.ts` configures the Arc chain and the RPC.
- `src/hooks/useArcBond.ts` loads factory vaults, vault state, and USDC balances.
- `src/lib/vault-activity.ts` and `src/lib/log-ranges.ts` page event logs from the deploy block.
- `src/hooks/useTx.ts` and `src/lib/tx.ts` send writes and surface pending, success, and revert states.
- `src/components/AppShell.tsx` is the signed-in chrome: nav, connect control, network gate, and the outlet for the screens above.
- `ConfigMissing` blocks vault actions when the factory address is absent.
- `NetworkGate` asks for Arc Testnet before a write.
- `WriteButton` and `TxStatus` are the shared transaction controls.
- Empty lists use `EmptyState`. There is no demo data.

Screens:

- Overview shows the connected owner, vault count, and USDC in those vaults.
- Vaults creates a clone through the factory, deposits, and withdraws.
- Policies edits the three numeric rules and the recipient allowlist.
- Agents authorizes one address or revokes it. The owner cannot be the agent. Payment submission is on `/app/pay`, not on this screen.
- Activity lists successful `Deposited`, `Withdrawn`, and `PaymentExecuted` events. A reverted call leaves no row.

## 9. Connect wallets with Privy, and keep a fallback

Dependencies: `@privy-io/react-auth` and `@privy-io/wagmi`.

`src/app/providers.tsx` branches on `NEXT_PUBLIC_PRIVY_APP_ID`:

- When the id is set, the tree is `PrivyProvider`, React Query, then Privy's Wagmi provider.
- When the id is empty, the tree is Wagmi plus React Query, and the connect button uses the injected browser wallet.

`src/lib/privy.ts` sets the Arc Testnet chain and wallet login only. Embedded wallet creation is off. The wallet list is MetaMask and detected wallets, plus WalletConnect when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set. Arc Testnet has to be added as a custom chain in the Privy dashboard. `http://localhost:3000` has to be an allowed origin. The browser still needs the Arc Testnet network (chain id `5042002`, RPC `https://rpc.testnet.arc.io`) before a transaction will send.

`ConnectBar` uses Privy when the app id is set, and `useConnect` otherwise. Disconnect writes the wagmi disconnected flag, calls `disconnectAsync`, asks each Privy wallet to disconnect, then calls Privy `logout`. Logout alone leaves the wagmi address in place, so the header still looks connected. The Disconnect button stays next to the shortened address, including while a session is open but the address has not appeared yet. It does not navigate away from the dashboard.

## 10. Replace the first landing page with a dark product page

The first screen at `/` is `apps/web/src/components/landing/Landing.tsx`. It is a marketing page. It does not read vault state and it does not send transactions.

The page went through three visual passes:

1. A light, white, Swiss-style page with a small vault diagram.
2. A dark Arc-style page: black canvas, blue accent, serif headlines, monospace labels.
3. The current page, which keeps that dark system and adds the sections below.

Typography is Manrope for UI text, Newsreader for headlines, and JetBrains Mono for labels and code. Tokens live in the `@theme` block of `apps/web/src/index.css`. The page background is `#070707`. Accent blue is `#3b82f6`.

Motion uses the `motion` package. `Reveal` fades sections in. The flow section draws a line on scroll. Cards move in on view. `HeroScroll` pins the hero and brings the payment-controls card up through the arc. `useReducedMotion` stacks those two sections with no pin when the user asks for less motion.

## 11. Add the landing sections, in page order

Current order inside `Landing`:

1. `SiteNav` — fixed top bar with the ArcBond mark, links to Product, How it works, Security, and Developers, plus Launch App.
2. `HeroScroll` — one pinned scene. The headline is "Give agents permission, not control." The background is the blue arc on `#07111f`, not a photo. Scrolling lifts the headline away and raises `LogoCloud` through the arc. The eight checks spread into the card: Vault, Policy, Agent, Allowlist, Expiry, Replay, Pause, and USDC. Reduced motion renders `BoltStyleChat` and then the logo cloud as separate blocks.
3. `LogoCloud` — the card that settles on the arc. Its label is "Checked before every payment inside the vault". A beam travels the border. The marks are words, not company logos. Outside the pinned scene the same card uses a marquee.
4. Risk — three cards: unrestricted spending, unauthorized recipients, repeated payments.
5. Flow — four steps from human policy to execute-or-revert, with the scroll line.
6. Product — `PolicyDemo` runs the SDK policy check in the browser. It explains that the result is local and is not an Arc transaction.
7. Boundaries — `SkewCards` shows three stacked cards: isolated funds, one agent, on-chain enforcement. The photos in this section are the two supplied images.
8. Security — the six rules the contract actually enforces, plus the pause caveat.
9. How it works — create, define, authorize, execute.
10. Developers — a static SDK snippet. The page does not submit it.
11. Close — headline, Launch ArcBond, documentation link, and the two photos again as overlapping frames.
12. `Footer`.

`PreviewCarousel`, `GalleryHero`, and `HeroScene` remain in the landing folder from earlier passes. The current page does not mount them.

## 12. Set the alternating section backgrounds

The landing page is not one flat black field. Sections alternate between two bands. Both classes are in `apps/web/src/index.css`.

- `band-b` is solid black, `#070707`.
- `band-a` is the blue band: a blue glow at the top over a gradient from `#163a78` through `#0c2348` to `#08162e`.

The pinned hero is `#07111f` with the arc. When the pin releases, the risk section is black, the flow section is blue, the product section is black, the boundaries section is blue, security is black, how-it-works is blue, developers is black, and the closing section is blue. The logo cloud is inside the hero scene, not its own band.

An earlier pass used a green gradient on the black sections. That was removed. Black sections are flat `#070707` again. The blue band is the only colored section background.

The footer is also black. It adds a short white radial highlight on its top edge so it separates from the blue closing section. The class is `site-footer`.

## 13. Place the two photos

The two source images are the agent-network illustration and the blue wireframe hands. They are served from:

- `apps/web/public/landing/agent-network.jpg`
- `apps/web/public/landing/agent-interface.webp`

They appear in the closing section only. The network image is the large rear frame and the wireframe image overlaps it at the bottom right. The overlap ring uses the current band color, so the frame matches blue on a blue section. The hero no longer uses either photo. The boundaries cards are gradient text cards, not photo cards.

## 14. Integrate the UI components

Each supplied component was copied into `apps/web/src/components/ui` and then edited so it matches ArcBond. The originals assumed a Next.js app and a `/components/ui` path. This repo is Vite, so `"use client"` was dropped and imports use the `@/` alias.

| Component | File | What changed for ArcBond |
| --- | --- | --- |
| Hero | `bolt-style-chat.tsx` and `landing/HeroScroll.tsx` | Copy is permission, not control. The arc is the scroll horizon. `HeroScroll` pins the scene and eases the logo card up through it. |
| Gradient button | `button-1.tsx` | Used for Launch App. It navigates inside the app instead of acting as a dead button. |
| Logo cloud | `logo-cloud-15.tsx` plus `logo-cloud-15-utils/` | Sits inside the hero scroll. Headline is "Checked before every payment inside the vault". The pinned scene spreads the eight words. The reduced-motion path keeps the marquee. Marks are words, not third-party logos. |
| Skew cards | `gradient-card-showcase.tsx` | Three gradient cards: programmable vaults, policy enforcement, and verifiable activity. They link into `/app`. |
| Footer | `footer.tsx` | Replaced the generic social footer. Columns are Product, Learn, Network, and Developers. Links go to `/app` routes, in-page anchors, Arc docs, the explorer, and the faucet. The legal line says ArcBond. |

Dependencies added for these pieces: `motion` and `lucide-react`. Tailwind 4 was already installed, so the marquee keyframes went into `index.css` rather than a Tailwind 3 config.

The logo-cloud helpers are local:

- `marquee.tsx` scrolls a duplicated row and pauses on hover.
- `border-beam.tsx` runs an 8-second beam around the card. The headline wave uses the same duration so the color crosses the words as the beam passes behind them.
- `logos.tsx` exports the eight inline marks.

## 15. Keep the app and the landing page on one visual system

The dashboard and the landing page share the same tokens: black canvas, blue accent, serif headlines, muted secondary text. The landing page does not use a green gradient. Cards on black sections use a faint white fill (`bg-white/[0.03]`) and a white 10% border so they are visible without turning the section gray.

Launch App and the footer product links enter the dashboard at `/app`. The dashboard connect control is the same one used after Privy login.

## 16. Run the app locally

```bash
copy .env.example .env
npm install
npm run test:contracts
npm test
npm run typecheck
npm run dev
```

Fill `.env` with the version 2 factory `0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793` and deploy block `67213321` before expecting live vaults. Fill `NEXT_PUBLIC_PRIVY_APP_ID` only if the Privy modal should replace the injected wallet. Leave private keys out of git.

The dev server is Vite on port 3000. The Privy dashboard should allow the local origin you actually open. Restart Vite after changing `NEXT_PUBLIC_*` values.

For the pay-per-API page, start the payments service in a second terminal and leave it running:

```bash
npm run pay:api
```

`/app/pay` reads `NEXT_PUBLIC_PAY_API_URL`, which should be `http://127.0.0.1:8787`. The service health line should report factory version 2 and payment intents available.

## 17. What is intentionally not done

- No mainnet deployment.
- No audit engagement. The threat model is `docs/ARCBOND_THREAT_MODEL.md`.
- Version 1 vaults already on testnet were not migrated. Only version 2 clones can run `executePaymentIntent`. See section 18.
- The landing policy demo does not broadcast.
- The logo cloud does not claim relationships with real companies.
- Sample vaults and sample balances are not shown when configuration is missing.

## 18. Add Pay-per-API and the intent relay

The two features are one payment path. The provider prices a record. The agent signs an EIP-712 intent for that exact price, recipient, and payment id. The relay submits the intent with its own key and pays the gas. The provider reads the vault and returns the record only after settlement.

The service is a deterministic lookup of the public Arc network record (`testnet` or `mainnet`). The price is 0.50 USDC, which is `500000` base units. It does not call a paid third-party API. The record is public; the gate is the payment check.

Code:

- `services/payments` serves both sides over one local process. Provider routes are `/provider/quotes` and `/provider/deliveries`. Relay routes are `/relay/intents`. State is SQLite through `node:sqlite`.
- `scripts/pay-per-api.ts` is the agent. It does not read `.env` and it does not take the owner key.
- `/app/pay` is the dashboard page. It can request a quote, ask the connected agent wallet to sign, and display what the provider returned. The page is not the payment authority.
- `packages/sdk/src/deployments.ts` keeps version 1 at `arc-testnet-v1` and records the intent factory as `arcTestnetFactoryV2`.

Factory version:

- `ArcBondVaultFactory.VERSION` is `2`.
- Version 2 clones implement `executePaymentIntent`.
- The deployed factory `0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d` does not have this getter. Calling `executePaymentIntent` on its clones reverts. Changing the Solidity source did not change that deployment.
- The provider refuses to quote when the configured factory does not report version 2 or higher.
- `script/Deploy.s.sol` logs the version. The broadcast that followed is recorded below.

Relay safeguards that are actually enforced:

- The digest is recomputed and must match.
- The recovered signer must be the agent named in the intent.
- The intent vault, recipient, token, amount, and payment id must match the quote.
- The quote and the intent deadline must still be in the future, and the deadline cannot outlast the quote.
- A failed simulation is stored and is not submitted.
- A second submission of a confirmed digest returns the stored result. The local test showed `intentNonce` stayed at 1.
- The relay account is separate from the owner and the agent.

Provider rule: `POST /provider/deliveries` ignores relay status and any caller-supplied transaction hash. It searches `PaymentExecuted` for the quote's payment id and requires `usedPaymentIds` to be true and the receipt to be successful. An unpaid quote returns HTTP 402.

Checks run after this change, on 14 October 2026:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Web and SDK passed. The payments package passed after fixing the relayer account import and the settlement log types. |
| `npm test -w @arcbond/sdk` | 20 passed. |
| `npm test -w @arcbond/web` | 6 passed. |
| `npm test -w @arcbond/payments` | 8 passed. The end-to-end case ran on local Anvil with chain id `5042002`, not on public Arc. |
| `npm run test:contracts` | 69 passed. The Arc USDC fork test was skipped, which is existing behavior unless `npm run test:contracts:fork` is used. |

The local settlement was submitted by the relayer account. The vault balance fell by `500000` and the provider balance rose by the same amount. Asking for delivery before payment returned 402. A signed intent to a different recipient was rejected with `quote_mismatch` and did not change the nonce. A quote above `maxPerPayment` stopped at `simulation_reverted` and did not increment the relayer nonce. An expired quote was rejected before submission.

Node prints an experimental warning for `node:sqlite`. That warning is from Node 22, not a test failure. `test_createVault_setsOwnerAndRegistry` includes `VERSION() == 2`.

On 14 October 2026 the version 2 factory was broadcast to Arc Testnet. Factory `0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793` is verified on Blockscout. Implementation `0x00c1f5E6e6bF62924af5FD22234c54a04D3201CE`. Deploy transaction `0x818d63fd71d32d145e60e971f8553b258c7dce0bb1958e155303856d7001aec4`, block `67213321`. Vault `0xDA9889938B7758c484Fb5972D2569c5865689e50` holds the agent `0x7a6138e14Da5b1C16ab5267b2309135FFAE43387`. The relay account `0x0c6Fa7Be1AE160f3AC2aDBeb92a9936ea5873E15` submitted `0x35f365c46364842b74170d9a31e0edabbc8414eae3a9d2c1b0b405b128055a45`. The receipt succeeded, `intentNonce` is 1, and the vault balance after that payment was 0.50 USDC. The provider then returned the Arc Testnet record. Version 1 vaults were not migrated. Mainnet was not touched. The provider recipient on that run was the owner, `0x39B6fd99d31A67475911D9d763B0Bd8323f99685`, so the test USDC was not sent to an unreachable address. A new vault must allowlist whatever recipient `/health` reports before a quote can settle.

The public Arc RPC does not implement `eth_sendTransaction`. `submitContractWrite` signs with the wallet's local account and sends a raw transaction. A bare address makes the relay fail before the vault sees the intent.

## 19. Pin the hero to the next section, and make disconnect clear the wallet

The landing scroll and the connect control were updated after the version 2 payment.

`apps/web/src/components/landing/HeroScroll.tsx` is a 230vh track with a sticky viewport. Scroll progress fades the headline, opens the arc rings slightly, and moves the logo card from below the fold to the middle of the screen. The card tilts flat as it arrives, and the eight checks spread from the center into one row. Further scrolling carries that whole frame away and reveals the risk section. `prefers-reduced-motion` skips the pin and renders the hero and the logo cloud in normal document flow.

`ConnectBar` no longer treats Privy `logout` as a full disconnect. The wagmi connector was staying connected, and the header key is the address, so the wallet still looked signed in. Disconnect now sets the connector's disconnected storage flag, disconnects wagmi, calls each connected wallet's `disconnect`, and then calls `logout`. The button is `shrink-0`, so the header search cannot push it off the row.

## 20. Add workspaces, metered sessions, the paywall SDK, and the guardian

These four pieces sit beside the version 2 vaults. They do not replace them.

- `contracts/src/ArcBondWorkspace.sol` is the shared accounting contract. `ArcBondWorkspaceFactory` deploys clones. `VERSION()` on that factory is 1 and means the workspace generation, not vault factory version 2.
- A workspace enforces one UTC-day cap, a per-agent cap, and a USDC reservation for each open session. Tests in `contracts/test/ArcBondWorkspace.t.sol` cover the second agent hitting the shared cap, a reservation blocking another payment, incremental voucher settlement, revocation, pause, and withdraw of only the free balance.
- `createArcBondPaywall` in `packages/sdk/src/paywall.ts` binds a quote to a payment id and verifies a `PaymentExecuted` log plus `usedPaymentIds` and a successful receipt. `services/paywall-example` is the runnable API. The existing payments service is unchanged.
- `/app/workspaces` and `/app/sessions` send owner transactions when `NEXT_PUBLIC_WORKSPACE_FACTORY_ADDRESS` is set. Names saved in the browser are labeled as local.
- `npm run guardian` indexes workspace logs into `services/guardian/data/state.json`. `/app/guardian` shows the index status. A failed index is not reported as an empty, healthy workspace. The service cannot pause or revoke by itself.
- Design notes are in `docs/PAYWALL_SDK.md`, `docs/WORKSPACES.md`, and `docs/POLICY_GUARDIAN.md`.
- On 15 October 2026 the workspace factory was deployed to Arc Testnet at `0x8F5C16679FB2b50344fBb5b599A37783613a34CD`, block `67226927`, transaction `0xf69f04999535a60ce49bee44b374fb0899f9f7fed6139f08c9a0a3a03082e54f`. Implementation `0x0cba2cd5F503a0a7b50E58dFc68533b929416C9A` reports `VERSION()` 1. The empty smoke workspace is `0xd6c3C13d6907123885a3c0E652646E2eE3a9DBA5`, created in `0xc4fc2599a1c0eb605a6f420e3eec6f73dd77246a81b08fc034126e1619467be5`. No USDC was deposited. Explorer source verification was not submitted. Mainnet was not used.

Checks after this change:

| Check | Result |
| --- | --- |
| `npm run test:contracts` | 83 passed. The Arc USDC fork test was skipped, which is existing behavior. |
| `npm test -w @arcbond/sdk` | 24 passed. |
| `npx tsc --noEmit -p apps/web` | Passed. |

Start both processes before walking the pay path in the dashboard:

```bash
npm run dev
npm run pay:api
```

A full click-through is: landing scroll, connect the owner on Arc Testnet, create a vault, deposit, save a policy, allowlist the payments recipient, authorize a different agent wallet, disconnect, connect that agent, quote, confirm the provider refuses before payment, sign and submit, ask the provider again, reconnect the owner, read activity, pause, prove a later intent fails, withdraw while paused, unpause, revoke the agent, and disconnect.
