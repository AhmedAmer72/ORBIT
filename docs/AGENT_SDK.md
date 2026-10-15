# ArcBond Agent SDK

`@arcbond/sdk` is a private workspace package. It is not published. Another package in this repository depends on it with `"@arcbond/sdk": "*"`.

The vault contract is the authority for every payment. The SDK prepares calls, reads state, and simulates them. A successful simulation is not an authorization.

## Install

From the repository root:

```bash
npm install
```

Import from the workspace:

```ts
import { createArcBondClient, parseUsdc, paymentIdFromLabel } from "@arcbond/sdk";
```

A future release would publish `packages/sdk` as `@arcbond/sdk`. Until then, install this repository and import the workspace package. The package entry is `packages/sdk/src/index.ts`.

## What the contracts actually support

`ArcBondVault.executePayment(recipient, amount, paymentId)` is the direct agent payment. The caller must be the agent. `executePaymentIntent` is the signed path: the agent signs an EIP-712 intent, and any account may submit it. Both paths use the same spending rules. The amount is a uint256 of USDC base units (6 decimals). `paymentId` is a `bytes32`.

The direct path checks, in order: pause, authorized agent, `expiresAt`, non-zero amount, per-payment cap, allowlist, non-zero id, unused id, then the current UTC-day cap. The intent path adds signature, deadline, policy version, and nonce checks before those spending rules. The id and the nonce are consumed only if the whole transaction succeeds. A revert rolls both back.

There is one agent per vault. The owner cannot be the agent. Pause blocks both payment functions. The owner can still withdraw. The period is `block.timestamp / 1 days` and resets at 00:00 UTC. Policy updates do not reset `spentInPeriod` or used ids. They do increment `policyVersion`.

Signed intents are documented in [INTENT_PAYMENTS.md](INTENT_PAYMENTS.md). The SDK does not support multiple agents or a rolling window. Mainnet factory version 2 is `0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d` (`arcMainnetFactory`). That address text matches the testnet version 1 factory; the mainnet bytecode is version 2. Testnet factory version 2 is `0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793`. Version 1 clones do not include `executePaymentIntent`.

## Initialize

```ts
import { createPublicClient, http } from "viem";
import { chainById, createArcBondClient, ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC } from "@arcbond/sdk";

const chain = chainById(ARC_TESTNET_CHAIN_ID);
const publicClient = createPublicClient({ chain, transport: http(ARC_TESTNET_RPC) });

const arcbond = createArcBondClient({
  chainId: chain.id,
  publicClient,
  factory: "0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793",
});
```

Chain ids accepted by `createArcBondClient` are Arc Testnet `5042002` and Arc mainnet `5042`. Any other id throws `ArcBondError` with code `unsupported_network`.

Pass `factory` only when you need `listVaults`. A zero factory throws `missing_factory`. Reads of a known vault address do not need the factory.

Writes need a viem `walletClient` and `account`. The SDK never accepts a private key. `submitPayment` without a signer throws `missing_signer`.

## Read a vault

```ts
const state = await arcbond.readVault(vault);
```

`readVault` returns the owner, pending owner, agent, expiry, caps, raw `spentInPeriod`, `displayedSpent` for the current UTC day, period id, pause flag, and the vault's ERC-20 USDC balance. It throws if the RPC read fails. It does not invent a vault.

`displayedSpent` is the value to compare with `periodLimit`. After 00:00 UTC the contract shows zero until the next successful payment, even if `spentInPeriod` still holds the previous day's number.

`listVaults(owner)` calls `factory.vaultsOf`.

## Payment request

```ts
import { parseUsdc, paymentIdFromLabel } from "@arcbond/sdk";

const request = {
  vault,
  recipient,
  amount: parseUsdc("0.01"),
  paymentId: paymentIdFromLabel("invoice-1"),
};
```

`parseUsdc` uses integer base units. `"1"` is `1000000n`. Do not multiply a JavaScript `number` by `1e6`.

`paymentIdFromLabel` hashes the UTF-8 label with keccak256. A `0x` hex string of exactly 32 bytes is used as-is. The id is scoped to that vault: the same id on another vault is a different slot. A new id does not skip the agent, cap, allowlist, expiry, or pause checks.

`packages/sdk/examples/preflight.ts` exports `examplePaymentRequest`. The SDK tests compile it.

## Preflight

```ts
const report = await arcbond.preflight({ ...request, caller: agent });
```

`preflight` reads the vault, the allowlist entry, and `usedPaymentIds`, then `eth_call`s `executePayment` as `caller`. The report is always `advisory: true`.

| `status` | Meaning |
| --- | --- |
| `passed` | The simulated call did not revert. The contract must still enforce the rules at execution. |
| `simulation_reverted` | The simulated call reverted. `errorName` is the decoded custom error when the ABI matches. |
| `unavailable` | The read or the call failed before a policy result was available. |
| `rejected` | A local check failed before a chain call, or the wallet rejected the transaction prompt. |

`evaluatePolicyLocally` mirrors the contract order for the educational UI and unit tests. It can be wrong if its inputs are stale. Prefer the simulation result on a live vault.

The local check can also report `InsufficientBalance`. That is not a vault custom error. The token transfer would revert.

## Submit

`submitPayment` simulates first. If the simulation reverts, it throws `ArcBondError` (`simulation_reverted`) and does not ask the wallet to sign.

If the simulation passes, the optional `onPhase` callback sees `simulated`, then `awaiting_signature`, then `submitted` with the transaction hash. The hash is not success. The function waits for the receipt and returns `confirmed` or `reverted`.

A wallet rejection returns `{ status: "rejected" }`. An RPC or fee error returns `{ status: "failed" }`. The function does not resubmit. After an unknown outcome, read `usedPaymentIds` for that id before trying again. If the id is unused, the same id is still safe to retry. If it is used, the payment settled.

## Intent payments

`createPaymentIntent`, `signPaymentIntent`, `preflightIntent`, and `executeIntent` are on the same client. `signPaymentIntent` takes an `IntentSigner` with `signTypedData`. It does not accept a raw private key. `executeIntent` refuses to submit an intent whose fields no longer hash to the digest captured at signing.

`intentAlreadyConsumed` reads `usedPaymentIds` and `intentNonce` after a lost response. `readVault` does not call `intentNonce` or `policyVersion`, because vaults from the current testnet factory do not implement those getters.

The full schema, domain, and wallet requirements are in [INTENT_PAYMENTS.md](INTENT_PAYMENTS.md). `packages/sdk/examples/intent.ts` is a compiling example. It returns a signed intent and does not broadcast.

## Errors

`ArcBondError` covers configuration and signer failures. Vault custom errors decoded from revert data keep their Solidity names, such as `UnauthorizedAgent`, `AmountExceedsLimit`, `RecipientNotApproved`, `PaymentIdUsed`, `PeriodLimitExceeded`, `AuthorizationExpired`, and `VaultPaused`. `explainPolicyFailure` turns those names into a short sentence.

The SDK does not log environment variables or private keys.

## Read-only demo

This does not send a transaction and does not read `.env`:

```bash
npx tsx scripts/sdk-preflight.ts 0x7bb7A6e2b1E44F2ad336A6e4644E1e78dB7023CD
```

`npm run agent:pay` is separate. It does not load `.env`. Export `VAULT_ADDRESS`, `RECIPIENT`, `AMOUNT`, `PAYMENT_ID`, and `AGENT_PRIVATE_KEY` in the shell. Use the agent key, not the owner key.

## Tests

```bash
npm test -w @arcbond/sdk
```
