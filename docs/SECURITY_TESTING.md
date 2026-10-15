# Security testing

These tests check the ArcBond vault and factory. A green run is not an independent audit, and it does not mean the contracts are safe to hold more than demo funds.

## Commands

```bash
npm run test:contracts
npm test -w @arcbond/sdk
npm test -w @arcbond/web
npm run typecheck
```

`npm run test:contracts` installs OpenZeppelin v5.4.0 and forge-std v1.11.0 into `contracts/lib` when they are missing, then runs `forge test` in `contracts/`. Foundry fuzz is configured for 64 runs in `contracts/foundry.toml`. The invariant test narrows that to 32 runs and depth 20.

Fork tests are separate:

```bash
npm run test:contracts:fork
```

They call the live Arc Testnet RPC. Vanilla Foundry on this Windows machine has previously failed Arc precompile calls with a stack underflow, so those tests can skip or fail for toolchain reasons. Do not treat a skip as a USDC integration pass.

## What is covered

`contracts/test/ArcBondIntent.t.sol` covers a valid relayer-submitted intent, a wrong signer, a short or empty signature, altered amount, recipient, token, and agent, another vault, another chain id, nonce replay, payment-id replay, per-vault id scope, the exclusive deadline, a policy-version bump, per-payment and period caps, an unapproved recipient, revocation, pause, authorization expiry, a short transfer that rolls the nonce back, a future nonce, a schema mismatch, unpause without a version bump, a field-by-field digest change, a viem digest vector on chain `5042002`, and a fuzz that other keys cannot spend.

`contracts/test/ArcBondVault.t.sol` is the original unit suite: create, initialize, decimals, deposit, authorized payment, unauthorized agent, zero amount, per-payment cap, zero caps, period cap, period boundary, policy updates that do not reset spend, allowlist, duplicate and zero ids, expiry, revoke, pause versus withdraw, agent cannot change policy or withdraw, short transfers, reentrancy, native value, owner cannot be the agent, two-step ownership, and a new payment id that still has to pass the other rules.

`contracts/test/ArcBondSecurity.t.sol` adds fuzz cases:

- a caller who is not the agent cannot pay, and the id stays unused
- an amount above `maxPerPayment` does not move USDC
- an unapproved recipient does not receive funds or consume the id
- the same id pays once
- a second payment that would pass the UTC-day cap reverts and leaves the first payment's accounting
- a non-owner cannot change policy
- `spentInPeriod + amount` overflow reverts before a second settlement

The invariant test targets only `pay` and `depositMore` on the test contract. After each call sequence it checks:

- the vault's ERC-20 balance equals deposits minus successful payments
- `displayedSpentInPeriod()` is less than or equal to `periodLimit`

Failed payments revert the whole call, so they do not change that accounting. The period in this invariant is a large cap on purpose: the fuzz is about balance consistency under the real `executePayment` and `deposit` functions, not about inventing a second limit.

## Properties the unit tests already pin

- Only the owner changes policy, recipients, agent, pause, and withdrawal.
- Only the authorized agent can `executePayment`.
- An agent cannot raise its own limit or withdraw.
- A paused vault rejects payments and still lets the owner withdraw.
- A consumed payment id cannot settle twice. A reverted payment does not leave the id consumed.
- Empty allowlists and zero caps fail closed for a positive payment.
- The mock USDC that returns short or reenters cannot desync the vault: the transfer check or the reentrancy guard reverts.

## Reproduce a failure

Foundry prints the failing inputs. Re-run one test with:

```bash
npm run test:contracts -- --match-test testFuzz_replayPaysOnce -vvv
```

The invariant counterexample is replayed with the seed Foundry prints. The depth and run count are the `forge-config` comments on `invariant_balanceMatchesSuccessfulTransfers`.

## Static analysis

`forge test` compiles with Solidity 0.8.30. `foundry.toml` does not set `deny_warnings`, so a compiler warning alone does not fail the suite. This workspace does not run Slither. Slither was not installed here, so there is no Slither report.

`npm test` covers the SDK policy helper, error decoding, and the web config helpers. Those tests do not replace the Foundry suite.

## Continuous integration

`.github/workflows/ci.yml` runs the workspace tests, typecheck, web build, and `npm run test:contracts`. Fork tests are not in that workflow. A failing command fails the job.
