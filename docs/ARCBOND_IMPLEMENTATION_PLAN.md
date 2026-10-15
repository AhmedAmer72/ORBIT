# ArcBond Implementation Plan

Verification date: **13 October 2026**.

This is the build plan for the specification in [ArcBond_Project_Overview.md](../ArcBond_Project_Overview.md). The overview stays unchanged. This document records where its assumptions were refined.

The repository started as that single file. There was no git metadata, frontend, contract, wallet integration, or environment example to preserve.

Broadcasting to Arc testnet or mainnet is a separate gate. Deploy scripts may exist in the repo. No transaction is sent until an operator explicitly confirms and a local key is available. No key is invented, committed, or copied into the app.

## 1. Repository audit

| Item | Finding | Feature status |
| --- | --- | --- |
| Product overview | Present: `ArcBond_Project_Overview.md` | Existing and verified (spec only) |
| Application framework | Absent | Missing and required for the MVP |
| Pages / design system | Absent | Missing and required for the MVP |
| Smart contracts | Absent | Missing and required for the MVP |
| Tests / deploy scripts | Absent | Missing and required for the MVP |
| Wallet connection | Absent | Missing and required for the MVP |
| Arc integration | Absent | Missing and required for the MVP |
| Environment files | Absent | Missing and required for the MVP |
| AI agent product | Not required for the security model | Planned for a later phase |
| Multiple agents, signed intents, indexer | Out of MVP | Planned for a later phase |
| Mainnet source verification | Explorer verified; `/api/` unverified | Blocked by unresolved information |
| Arc Foundry on native Windows | Official install needs WSL | Blocked by unresolved information until WSL or a Unix host is used |

## 2. Product scope

### MVP (missing and required)

1. Connect an EIP-1559 wallet to chain ID `5042` and refuse writes on any other chain.
2. Deploy an isolated vault from a factory.
3. Deposit USDC only through the 6-decimal ERC-20 interface.
4. Configure per-payment and fixed-period caps plus an allowlist.
5. Authorize one agent with an expiration.
6. Execute an allowed payment.
7. Reject oversized, unapproved, replayed, revoked, expired, and paused payments.
8. Owner pause and withdraw while paused.
9. Display verified on-chain balances, successful events, and explorer links.
10. Public docs, TypeScript SDK, and a two-key demo script.

### Explicit non-goals

Multiple agents, per-agent budgets, signed intents, session keys, AI risk scoring, natural-language policies, ERC-8004 registration, organization roles, protocol fees, a new token, upgradeability, arbitrary external calls, a backend, and an indexer.

Rolling 24-hour windows are a non-goal. The MVP uses fixed 86,400-second UTC windows.

### Later phases

- Phase 2: SDK polish, webhooks, log indexing, more than one agent, policy templates.
- Phase 3: signed payment intents, human approval for exceptions, formal verification.

## 3. Proposed architecture

Per-user EIP-1167 clones. Ownerless factory. Immutable implementation. ERC-20-only USDC. No backend.

Details, diagrams, and the payment sequence: [ARCBOND_ARCHITECTURE.md](ARCBOND_ARCHITECTURE.md).

Network constants and sources: [ARCBOND_NETWORK_CONFIGURATION.md](ARCBOND_NETWORK_CONFIGURATION.md).

## 4. Contract specifications

See [ARCBOND_ARCHITECTURE.md](ARCBOND_ARCHITECTURE.md) and [ARCBOND_THREAT_MODEL.md](ARCBOND_THREAT_MODEL.md).

Files:

- `contracts/src/ArcBondVault.sol`
- `contracts/src/ArcBondVaultFactory.sol`
- `contracts/src/interfaces/IArcBondVault.sol`
- `contracts/script/Deploy.s.sol`

Libraries: OpenZeppelin v5 `SafeERC20`, `ReentrancyGuard`, `Pausable`, `Clones`. Local two-step ownership (non-upgradeable package). Confirm `ReentrancyGuard` treats storage `0` as not entered so clones work.

`foundry.toml` sets `evm_version = "osaka"` and the solc version the installed compiler actually runs.

## 5. Frontend specifications

`apps/web` — Next.js App Router, TypeScript, Tailwind, wagmi, viem.

Pages: Overview, Vaults, Policy, Agents, Activity, Docs.

Dark, restrained visual identity. One accent. Visible focus. Status text plus color. No gradients, glow, decorative buttons, or fake balances.

`packages/sdk` — read vault, build deposit and payment requests, simulate, decode custom errors, submit with the caller's viem wallet.

`scripts/agent-pay.ts` — `AGENT_PRIVATE_KEY` from an untracked env file.

## 6. Repository file structure

```
ArcBond/
  ArcBond_Project_Overview.md
  README.md
  .env.example
  .gitignore
  package.json
  docs/
  contracts/
    foundry.toml
    src/
    test/
    test/fork/
    script/
  apps/web/
  packages/sdk/
  scripts/agent-pay.ts
```

## 7. Dependencies

Pinned at install time and locked:

- Contracts: `forge-std`, `@openzeppelin/contracts` v5
- App: `next`, `react`, `react-dom`, `typescript`, `wagmi`, `viem`, `@tanstack/react-query`, `tailwindcss`
- Tooling: ESLint, vitest

Arc Foundry (`arc-forge`, `arc-cast`, `arc-anvil`) from the official releases page when a Unix-like environment is available.

## 8. Ordered milestones

1. Planning documents (this folder).
2. Toolchain and workspace scaffold.
3. Vault, factory, and unit tests.
4. Arc testnet fork tests.
5. SDK and agent script.
6. Dashboard.
7. Local verification commands.
8. Broadcast gate: testnet, then optional minimal mainnet, only after explicit confirmation.

## 9. Tasks and outcomes

| Task | Files | Outcome |
| --- | --- | --- |
| Docs | `docs/ARCBOND_*.md` | Audited plan, architecture, threats, tests, network facts |
| Scaffold | `package.json`, `contracts/foundry.toml`, `.env.example` | Workspaces and compiler pin |
| Contracts | `contracts/src/*.sol` | Policy-enforcing vault + factory |
| Unit tests | `contracts/test/ArcBondVault.t.sol` | All MVP revert and success paths |
| Fork tests | `contracts/test/fork/ArcUsdc.t.sol` | Real USDC decimals, deposit, blocklist |
| SDK | `packages/sdk` | Encode, simulate, decode, submit |
| Agent | `scripts/agent-pay.ts` | Two-key demo without owner key |
| Web | `apps/web` | Six functional pages, wrong-network block |
| Deploy script | `contracts/script/Deploy.s.sol` | Ready, not broadcast |

## 10. Verification commands

```bash
npm run test:contracts
npm run test:contracts:fork
npm run typecheck
npm run lint
npm test
npm run build
```

## 11. Acceptance criteria

See [ARCBOND_TEST_PLAN.md](ARCBOND_TEST_PLAN.md).

## 12. Security and deployment risks

- Unaffected by frontend checks. A bug in the vault can lose deposited USDC.
- Compromised agent spends the remaining allowance.
- Compromised or lost owner key is fatal for that vault.
- Fixed UTC windows allow two caps across a boundary.
- Mainnet fee floor and verifier URL must be confirmed at broadcast time.
- Independent review is required before balances beyond the demo stay in a vault.

## 13. Outstanding questions

Recorded in [ARCBOND_NETWORK_CONFIGURATION.md](ARCBOND_NETWORK_CONFIGURATION.md):

- Live Arc Foundry asset for this machine / WSL
- Mainnet Blockscout API URL
- Live mainnet base fee
- Public RPC log-range limits

## 14. Critical path

Local: docs → install toolchain → contracts + unit tests → fork tests → SDK → dashboard → `test` / `lint` / `build`.

Broadcast (not automatic): testnet deploy and faucet demo → fee query → optional minimal mainnet demo → stop for review.

## 15. Release checklist

- Clean tests
- Verified source or an explicit unverified note
- Chain id `5042` and USDC constant checked on-chain
- Demo txs linked
- No secrets in git
- Empty factory address shows configuration-missing
- Wrong-network state checked
- UI copy says the period resets at 00:00 UTC
