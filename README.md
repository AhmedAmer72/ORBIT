# Orbit

Orbit is the product name for this on-chain spending-control app. An owner funds a vault with USDC on Arc, sets the spending rules, and authorizes one agent. The vault contract enforces those rules. The agent cannot raise its own limits, pay an unapproved recipient, or reuse a payment id.

The frontend is branded Orbit. The Solidity contracts and the workspace package are still named ArcBond (`ArcBondVault`, `@arcbond/sdk`). That is the deployed code, not a second product.

## What you can do

- Create a vault from the mainnet factory and deposit USDC (6 decimals).
- Set a per-payment cap, a UTC-day cap, an expiry, and a recipient allowlist. An empty allowlist rejects every payment.
- Authorize one agent. The owner cannot be that agent.
- Pay directly with `executePayment`, or sign an EIP-712 intent that another account submits with `executePaymentIntent`. Version 2 vaults support intents. Version 1 vaults do not.
- Open an agent workspace, reserve a session budget, and close the session. A reservation locks the same USDC so two agents cannot spend it twice.
- Read payment activity from chain logs. A transaction hash is not success until the receipt succeeds.
- Use `@arcbond/sdk` to simulate a payment, bind a paywall quote, or score guardian heuristics.

A simulation does not move USDC. Guardian scores are heuristics, not fraud findings. This repository is not an audit, and the mainnet contracts have not had their source submitted to the explorer.

## Networks

| | Arc mainnet | Arc Testnet |
| --- | --- | --- |
| Chain ID | `5042` | `5042002` |
| RPC | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.io` |
| Explorer | `https://explorer.arc.io` | `https://explorer.testnet.arc.io` |
| USDC | `0x3600000000000000000000000000000000000000` | same address |

ERC-20 USDC uses 6 decimals. Native gas is also USDC and uses 18 decimals. The minimum `maxFeePerGas` used by the SDK is 20 gwei.

### Mainnet contracts (15 October 2026)

| Contract | Address | Block |
| --- | --- | --- |
| Vault factory, version 2 | `0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d` | `26000245` |
| Vault implementation | `0xf37409Cd3d158E1B8f88678CB711dbc206B45781` | created in the factory transaction |
| Workspace factory, version 1 | `0x8fb1a3cff48ec873ef0526a902425813979c7b9e` | `26000255` |
| Workspace implementation | `0x3be6031B7473F334D75ae69AEeCABa87ec3D93d3` | created in the factory transaction |

The mainnet vault factory address is the same text as the first testnet factory. On chain `5042` the code is version 2. The testnet contract at that address was not modified. Testnet intent vaults use factory `0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793`.

No mainnet vault was created or paid as part of that deploy. The payments relay is not enabled on mainnet until `PAY_RELAY_MAX_NATIVE` is set on the server.

## App map

| Route | What it does |
| --- | --- |
| `/` | Landing page |
| `/sdks` | Agent SDK, Paywall SDK, and workspace/guardian helpers |
| `/app` | Vault overview for the connected owner |
| `/app/vaults` | Create a vault and deposit USDC |
| `/app/policies` | Caps, allowlist, expiry |
| `/app/agents` | Authorize an agent and send a payment from that wallet |
| `/app/activity` | Logs for the selected vault |
| `/app/pay` | Pay-per-API quote and settlement |
| `/app/workspaces` | Create a workspace and register an agent |
| `/app/sessions` | Open and close a metered session |
| `/app/guardian` | Read heuristic alerts |
| `/app/docs` | Contract and configuration notes |

## Local setup

Requirements: Node.js 22 or newer, and Foundry if you run the contract tests.

```bash
git clone <your-fork>
cd <repo>
copy .env.example .env
npm install
npm run dev
```

The site runs at `http://localhost:3000`. Copy `.env.example` and fill only the public values you need. Never commit `.env`.

```bash
npm test
npm run typecheck
npm run build
npm run test:contracts
```

`npm run test:contracts` installs OpenZeppelin and forge-std under `contracts/lib` when they are missing. Those directories are gitignored.

## SDK

`@arcbond/sdk` is a private workspace package. It is not published to npm. Import it from this repository.

```ts
import {
  arcMainnetFactory,
  chainById,
  createArcBondClient,
  ARC_MAINNET_CHAIN_ID,
  ARC_MAINNET_RPC,
} from "@arcbond/sdk";
```

`createArcBondClient` accepts chain `5042` or `5042002`. It reads vault state, simulates `executePayment`, and submits a transaction only when you pass a viem wallet client. It never accepts a private key. `createArcBondPaywall` stores a quote and later checks `PaymentExecuted`, `usedPaymentIds`, and a successful receipt. A signature or a relay status is not delivery. Session settlement emits `PaymentExecuted` but does not set `usedPaymentIds`.

Details are in [docs/AGENT_SDK.md](docs/AGENT_SDK.md) and [docs/PAYWALL_SDK.md](docs/PAYWALL_SDK.md).

## Deploy the website on Vercel

Use the repository root as the Vercel project root. Do not set the root to `apps/web`. The site depends on the `packages/sdk` workspace. [`vercel.json`](vercel.json) already sets the install, the Vite build, and the single-page fallback.

In the Vercel project settings, add these environment variables before the first build. They are public. Do not add `PRIVATE_KEY`, `AGENT_PRIVATE_KEY`, or `PAY_RELAYER_PRIVATE_KEY` here.

| Variable | Production value |
| --- | --- |
| `NEXT_PUBLIC_ARC_CHAIN_ID` | `5042` |
| `NEXT_PUBLIC_ARC_RPC_URL` | `https://rpc.mainnet.arc.io` |
| `NEXT_PUBLIC_ARC_EXPLORER_URL` | `https://explorer.arc.io` |
| `NEXT_PUBLIC_USDC_ADDRESS` | `0x3600000000000000000000000000000000000000` |
| `NEXT_PUBLIC_FACTORY_ADDRESS` | `0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d` |
| `NEXT_PUBLIC_FACTORY_DEPLOY_BLOCK` | `26000245` |
| `NEXT_PUBLIC_WORKSPACE_FACTORY_ADDRESS` | `0x8fb1a3cff48ec873ef0526a902425813979c7b9e` |
| `NEXT_PUBLIC_WORKSPACE_DEPLOY_BLOCK` | `26000255` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | your Privy app id, if you use the Privy modal |
| `NEXT_PUBLIC_PAY_API_URL` | the Render payments URL, after that service exists |
| `NEXT_PUBLIC_GUARDIAN_URL` | the Render guardian URL, after that service exists |

Add the Vercel domain to the Privy app's allowed origins. Injected wallets work without Privy.

## Deploy the website on Render (optional)

If you use Render instead of Vercel, create a **Web Service** (not a static site) at the **repository root**. Render must run a process that binds to `PORT` on `0.0.0.0`.

| Setting | Value |
| --- | --- |
| Root directory | repository root (not `apps/web`) |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |

`npm start` runs [`scripts/serve-dist.mjs`](scripts/serve-dist.mjs), which serves the built `dist/` folder. If the start command is missing, or only the build runs again at deploy time, Render reports **Port scan timeout** even when the Vite build succeeded.

Use the same public `NEXT_PUBLIC_*` variables as Vercel. [`render.yaml`](render.yaml) includes an `orbit-web` service with these commands.

## Deploy the APIs on Render

[`render.yaml`](render.yaml) describes two Node web services. Render injects `PORT`. The payments process listens on `0.0.0.0` when `PORT` is set. The same is true for guardian.

Create the services from the blueprint, then set the secret fields in the Render dashboard:

- `PAY_PROVIDER_RECIPIENT`: optional. Leave it unset. Each quote names the recipient, and the vault allowlist decides whether that address can be paid.
- `PAY_RELAYER_PRIVATE_KEY`: a dedicated relayer key. It must not be the owner key or the agent key.
- `PAY_RELAY_MAX_NATIVE`: a wei cap on native gas the relayer may spend. The mainnet process refuses to start a relayer without this cap.
- `GUARDIAN_WORKSPACES`: comma-separated workspace addresses to index. Leave it empty until a workspace exists.

Leave the relayer unset if you only want the website. The mainnet relay stays off until you choose that cap on purpose.

Point `NEXT_PUBLIC_PAY_API_URL` and `NEXT_PUBLIC_GUARDIAN_URL` at the Render URLs and redeploy the Vercel site. Both services must allow the site origin if a browser calls them directly.

## Secrets

These files and values stay off GitHub:

- `.env` and any `.env.*` file except `.env.example`
- `PRIVATE_KEY`, `AGENT_PRIVATE_KEY`, `PAY_RELAYER_PRIVATE_KEY`
- SQLite files under `services/payments/data` and `services/guardian/data`
- Foundry broadcast output and `contracts/lib`

Public factory addresses, chain ids, and RPC URLs are not secrets. A key pasted into a chat, a screenshot, or a hosting log should be treated as compromised and rotated.

## Layout

```
apps/web              Orbit frontend (Vite, React, Tailwind)
packages/sdk          @arcbond/sdk
services/payments     Pay-per-API quotes and the intent relay
services/guardian     Heuristic alert index
contracts             ArcBondVault, workspace, and factories
docs                  Network, SDK, intents, and security notes
```
