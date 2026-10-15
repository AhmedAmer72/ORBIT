# Workspaces and metered sessions

`ArcBondWorkspace` is a new clone contract. It does not upgrade Factory V1 or Factory V2 vaults, and it does not move their USDC.

Factory `VERSION()` is 1. That number is the workspace generation, not the vault factory generation. Vault factory version 2 remains `0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793`.

## What the contract enforces

One workspace holds USDC and is the only accounting authority for its agents.

- `workspacePeriodLimit` is the shared UTC-day cap.
- Each agent has `maxPerPayment`, `periodLimit`, and `expiresAt`.
- `reserved` is USDC locked by open sessions. It does not reset at 00:00 UTC.
- `reservedInPeriod` counts those locks against the current day's caps.
- An immediate payment must fit in the free balance and in `spent + reserved + amount` for both the workspace and that agent.
- The owner can withdraw only the free balance, including while spending is paused.
- An empty allowlist still rejects every payment and every session provider.
- The owner cannot be an agent.
- Changing the cap, the allowlist, or an agent bumps `policyVersion`. Open sessions keep the version from when they were opened. A later voucher with the old version cannot settle.

A workspace name stored in the browser is not part of this cap.

## Sessions

The owner opens a session for one agent and one approved provider. The budget is reserved immediately, so two agents cannot spend the same USDC through another call.

The agent signs an EIP-712 `UsageVoucher` (domain `ArcBondWorkspace` version `1`). The provider, or anyone, submits `settleSession`. The contract pays only `cumulativeAmount - settled`. A repeated cumulative total pays nothing. A lower sequence is rejected. The incremental charge must also fit the agent's per-charge maximum.

Revoking the agent bumps the policy version, so later vouchers fail. The owner closes the session to release the unsettled reservation. Pause blocks payments and settlement. It does not block withdraw of free USDC or `closeSession`.

A voucher does not prove the provider delivered a service. Delivery records stay off-chain.

## Dashboard

`/app/workspaces` creates a workspace and sends the owner transactions. It appears only after `NEXT_PUBLIC_WORKSPACE_FACTORY_ADDRESS` is set.

`/app/sessions` opens and closes a session and reads `sessions(sessionId)` from the contract. It does not show invented usage.

The Arc Testnet deployment on 15 October 2026:

| | |
| --- | --- |
| Factory | `0x8F5C16679FB2b50344fBb5b599A37783613a34CD` |
| Implementation | `0x0cba2cd5F503a0a7b50E58dFc68533b929416C9A` |
| Deploy transaction | `0xf69f04999535a60ce49bee44b374fb0899f9f7fed6139f08c9a0a3a03082e54f` |
| Deploy block | `67226927` |
| Chain | `5042002` |
| Smoke workspace | `0xd6c3C13d6907123885a3c0E652646E2eE3a9DBA5` |
| Smoke transaction | `0xc4fc2599a1c0eb605a6f420e3eec6f73dd77246a81b08fc034126e1619467be5` |

The smoke call created an empty workspace owned by the deployer. It did not deposit USDC. `VERSION()` on the factory and the implementation returned 1. Source verification on the explorer was not submitted. Vault factory version 2 was not redeployed.

```bash
npx tsx scripts/deploy-workspace.mjs
```

That script refuses to broadcast unless the RPC reports chain id `5042002`. Do not point a workspace deployment at Arc mainnet.
