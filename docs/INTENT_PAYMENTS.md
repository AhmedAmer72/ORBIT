# Intent-bound payments

An intent-bound payment is a USDC transfer whose recipient, amount, vault, token, agent, payment id, nonce, deadline, and policy version are covered by the agent's EIP-712 signature. The vault still decides whether that payment is allowed. A valid signature does not raise a cap, approve a recipient, unpause a vault, or extend an expired authorization.

The signature binds the request to those fields. It does not prove that an agent completed a real-world task, that a service was delivered, or that the payment's purpose is legitimate. There is no purpose or service hash in this version.

## Where this runs

The functions are in `contracts/src/ArcBondVault.sol`. They are part of the source that a new factory would clone.

The Arc Testnet factory `0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d` (implementation `0xf37409Cd3d158E1B8f88678CB711dbc206B45781`, deploy block `67052589`) was deployed before this code. Its clones do not have `executePaymentIntent`, `intentNonce`, or `policyVersion`. Calling those selectors on that deployment reverts. Version 2 is a separate factory, `0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793` (implementation `0x00c1f5E6e6bF62924af5FD22234c54a04D3201CE`, deploy block `67213321`). Only vaults created by version 2 support intents. Mainnet has no ArcBond factory here.

`readVault` still reads the old getters, so the dashboard can keep reading the deployed vaults. Intent reads are separate and return `ArcBondError` code `intent_unavailable` when the vault has no intent state.

## Authorization

Four decisions stay separate:

1. The owner sets policy, the allowlist, and the single agent. The owner key is not the agent key. The SDK never asks for a seed phrase.
2. The agent signs each intent with its own EOA key.
3. The signature shows that this agent committed to this exact intent.
4. The contract accepts the payment only if the signer is still the current agent and the current policy allows the payment.

Anyone may submit a signed intent. The submitter is not granted spending rights. Contract wallets are not supported: verification is ECDSA recovery of an EOA signature through OpenZeppelin `ECDSA.tryRecover`. A signature from a smart-contract wallet fails `InvalidSignature`.

`executePayment` remains. The transaction sender must be the agent, so that path is bound by the agent's transaction signature rather than by EIP-712. It enforces the same spending rules through the same internal settlement. A compromised agent key can still call `executePayment` directly or sign new intents inside the remaining policy. Revocation and the caps are what stop that. Intent signing does not remove that risk.

## Signed struct

```solidity
struct PaymentIntent {
    address vault;
    address agent;
    address recipient;
    address token;
    uint256 amount;
    bytes32 paymentId;
    uint256 nonce;
    uint256 deadline;
    uint256 policyVersion;
}
```

`amount` is a uint256 of USDC base units. Six decimals. `"0.50"` in the SDK is `500000`. No floating-point value is authorized on-chain.

The type string is exactly:

```text
PaymentIntent(address vault,address agent,address recipient,address token,uint256 amount,bytes32 paymentId,uint256 nonce,uint256 deadline,uint256 policyVersion)
```

The struct hash is `keccak256(abi.encode(typehash, vault, agent, recipient, token, amount, paymentId, nonce, deadline, policyVersion))`.

## Domain

| Field | Value |
| --- | --- |
| name | `ArcBondVault` |
| version | `1` |
| chainId | `block.chainid` at verification |
| verifyingContract | the vault clone, `address(this)` |

EIP-712 domain type: `EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)`.

The digest is OpenZeppelin `_hashTypedDataV4` of the struct hash. On an EIP-1167 clone the implementation immutables hold the name and version. The domain separator is rebuilt for the clone address because `address(this)` is not the implementation. A signature for one clone, chain, name, or version does not verify on another.

Wallets must sign with `eth_signTypedData_v4` (EIP-712), not `personal_sign`. The SDK method is `signTypedData` on the agent signer.

## Replay, expiry, and policy version

Each vault has `intentNonce`, starting at 0. The intent must use that value. A successful `executePaymentIntent` increments it. `executePayment` does not. A failed or reverted intent does not increment it and does not mark the payment id, because the nonce write and the transfer are in one transaction and Solidity reverts all of it.

`usedPaymentIds` is still per vault and is shared by both payment functions. The same id cannot settle twice on one vault, even at a later nonce. The same id on another vault is a different slot.

`deadline` is exclusive, same as `expiresAt`: `block.timestamp >= deadline` reverts `IntentExpired`. An intent at exactly the deadline is expired. An authentic signature does not keep an intent valid after that timestamp.

`policyVersion` starts at 0 and increments on `updatePolicy`, `setRecipient`, `authorizeAgent`, and `revokeAgent`. It does not increment on pause, unpause, deposit, or withdraw. Pause is checked live. After unpause, an intent can still execute if the version, nonce, deadline, and agent still match. A setup of update, allowlist, and authorize ends at version 3. Read `policyVersion()` when signing. Do not assume 0.

Revocation is read at execution. A signature made before `revokeAgent` cannot pay afterward.

## Contract checks

`executePaymentIntent(PaymentIntent intent, bytes signature)` checks, in order:

1. Reentrancy guard.
2. The vault is not paused.
3. `intent.vault` is this vault.
4. `intent.token` is the USDC constant `0x3600000000000000000000000000000000000000`.
5. `intent.agent` is the current agent and is not zero.
6. `ECDSA.tryRecover` of the digest returns that agent. Any malformed, empty, or mismatched signature is `InvalidSignature`. High `s` is rejected by the library.
7. `block.timestamp < expiresAt`.
8. `block.timestamp < intent.deadline`.
9. `intent.policyVersion == policyVersion`.
10. `intent.nonce == intentNonce`.
11. Amount is non-zero and within `maxPerPayment`.
12. Recipient is approved.
13. Payment id is non-zero and unused on this vault.
14. Increment `intentNonce`, then settle: sync the UTC day, check `periodLimit`, mark the id, increase `spentInPeriod`, transfer, and require the balance to drop by exactly `amount`.

Settlement emits the existing `PaymentExecuted` with the agent, not the relayer. A second event, `PaymentIntentExecuted`, includes the submitter, nonce, and policy version. A reverted call persists neither event.

No execution argument can replace a signed field. The only unsigned execution input is the signature bytes and `msg.sender`, and `msg.sender` is not a spending authority.

## Lifecycle you can actually observe

| State | How you know |
| --- | --- |
| Constructed | The SDK returned an intent from current vault reads. Nothing is signed. |
| Signed | `signPaymentIntent` returned `{ status: "signed", digest, signature }`. This is local. The vault has not accepted it. |
| Ready for submission | The signed object is unchanged and a preflight, if you ran one, did not revert. Preflight is advisory. |
| Submitted | The wallet returned a transaction hash. The hash is not a payment. |
| Confirmed | The receipt status is success. `executeIntent` returns `intentExecution` from `PaymentIntentExecuted` when that log is present. `intentNonce` moved and `usedPaymentIds` is true. |
| Reverted | The receipt status is failed, or the simulation reverted. Nonce and payment id are unchanged. |
| Expired | A new simulation or call reverts `IntentExpired` or `AuthorizationExpired`. |
| Already consumed | `intentNonce` is no longer the signed nonce, or `usedPaymentIds(paymentId)` is true. |
| Invalidated | The owner changed policy, the allowlist, or the agent, so `policyVersion` or `agent` no longer matches. Pause blocks execution without bumping the version. |

## SDK

```ts
import { createPublicClient, http } from "viem";
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC,
  chainById,
  createArcBondClient,
  paymentIdFromLabel,
  type IntentSigner,
} from "@arcbond/sdk";

const chain = chainById(ARC_TESTNET_CHAIN_ID);
const publicClient = createPublicClient({ chain, transport: http(ARC_TESTNET_RPC) });
const arcBond = createArcBondClient({ chainId: ARC_TESTNET_CHAIN_ID, publicClient, account: submitter });

const intent = await arcBond.createPaymentIntent({
  vault,
  recipient,
  amount: "0.50",
  paymentId: paymentIdFromLabel("invoice-1"),
  deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
});

const signedIntent = await arcBond.signPaymentIntent(intent, agentSigner as IntentSigner);
const preview = await arcBond.preflightIntent({ ...signedIntent, caller: submitter });
const result = await arcBond.executeIntent(signedIntent);
```

`executeIntent` needs a wallet client and account on the client; the snippet above omits them until you are ready to submit. `packages/sdk/examples/intent.ts` compiles the sign path and does not broadcast. Pass the agent signer. Do not pass the owner key.

`createPaymentIntent` reads `agent`, `intentNonce`, `policyVersion`, and `USDC()` from the vault. Decimal strings go through `parseUsdc`. Changing a signed field makes `executeIntent` throw `invalid_request` and skip submission. The contract would also reject the old signature.

`preflightIntent` is an `eth_call`. It can be stale before the transaction is mined.

After a lost response, call `intentAlreadyConsumed(publicClient, intent)`. If the nonce advanced or the payment id is used, do not sign a replacement for that same id.

## Wallet

The signing account must be the vault's current agent EOA. The interface that requests the signature should show that account. Typed data is the required method. Do not ask the user to paste a seed phrase or private key. Do not store an agent key in browser storage, source, logs, or a committed env file. Tests may use a key that exists only inside the test file.

## Errors

| Error | Meaning |
| --- | --- |
| `InvalidSignature` | Recovery failed, or the signer is not `intent.agent`. |
| `IntentExpired` | `block.timestamp >= deadline`. |
| `WrongVault` | The intent names another vault. |
| `WrongToken` | The token is not this vault's USDC. |
| `PolicyVersionMismatch` | The owner changed policy, the allowlist, or the agent after signing. |
| `InvalidNonce` | The nonce is not the vault's current `intentNonce`. |
| `UnauthorizedAgent` | `intent.agent` is not the current agent. |
| `AuthorizationExpired` | The agent authorization time has been reached. |
| `AmountExceedsLimit` | Above `maxPerPayment`. |
| `PeriodLimitExceeded` | The UTC-day total would be exceeded. |
| `RecipientNotApproved` | The recipient is not allowlisted. |
| `PaymentIdUsed` | This vault already settled that id. |
| `VaultPaused` | Payments are paused. Withdrawal is still owner-only. |
| `TransferAmountMismatch` | The USDC balance did not fall by `amount`. Nonce and id stay unused. |

`intent_unavailable` is an SDK error for a vault that does not implement the new getters. It is not a Solidity error.

## Reproduce the tests

```bash
npm run test:contracts -- --match-contract ArcBondIntentTest
npm test -w @arcbond/sdk
```

Foundry uses a public test key `0xA11CE` inside `contracts/test/ArcBondIntent.t.sol`. The SDK digest test uses the public Anvil account `0xac0974…ff80` and expects digest `0xc8857c007e3ed4b502c4eee3ca3cf294f9145ff8280a770d8d3d7fade66d2416` for the fixed vector on chain `5042002` and verifying contract `0x1111111111111111111111111111111111111111`. The matching Forge test etches the vault runtime at that address and compares `hashPaymentIntent`.

Rejected cases in that Forge file include a wrong key, a 64-byte signature, an empty signature, a digest from a different type string, an altered amount or recipient, another vault, chain id plus one, a reused nonce, a reused payment id, the same id on a second vault, the deadline boundary, a policy update, a per-payment cap, a period cap, an unapproved recipient, a revoked agent, pause, authorization expiry, a short USDC transfer, a future nonce, and a substituted agent. These are local tests. They do not spend Arc gas.

## Migration

Vaults are immutable EIP-1167 clones. Editing this source does not change deployed bytecode. A new `ArcBondVaultFactory` deployment creates a new implementation in its constructor and clones that implementation. Old clones keep their code and their USDC. Do not move funds as part of adopting intents. Point the SDK and `NEXT_PUBLIC_FACTORY_ADDRESS` at the new factory only after that deployment is verified. Until then, treat intent payments as local-test ready and unavailable on the live factory.

The current source factory is version 2 (`VERSION()` returns `2`). Version 2 is the first generation whose clones implement `executePaymentIntent`. That generation is deployed on Arc Testnet at `0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793`. The pay-per-API provider and intent relay in `services/payments` refuse to quote against a factory that does not report that version. See [PAY_PER_API.md](PAY_PER_API.md).
