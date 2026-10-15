# Security assumptions

This note describes the rules the current contracts implement. It is not an audit, and the test suite is not a substitute for one.

## Trust

The vault holds ERC-20 USDC and moves it only through `deposit`, `executePayment`, `executePaymentIntent`, and `withdraw`. The factory deploys clones and cannot move funds. The dashboard, the SDK, and an agent process are not the security boundary. They can prepare a bad call. The vault reverts it.

An SDK simulation observes one block. Another transaction can change the vault before yours is mined. The contract checks again inside `executePayment` and `executePaymentIntent`.

## Policy

- One agent. `authorizeAgent` replaces that address. The owner, the zero address, and the vault cannot be the agent.
- `revokeAgent` sets the agent and `expiresAt` to zero and increments `policyVersion`. Later `executePayment` calls revert `UnauthorizedAgent`. A previously signed intent also reverts, because authorization is read at execution.
- `expiresAt` is exclusive. `block.timestamp >= expiresAt` reverts `AuthorizationExpired`. Zero means already expired.
- `maxPerPayment` and `periodLimit` are independent. Zero means a positive payment cannot pass.
- Recipients must be allowlisted. The zero address and the vault cannot be added. The owner can be a recipient.
- `paymentId` is an arbitrary `bytes32` per vault. It is marked used before the token transfer. If the transfer reverts, the whole transaction reverts, so the id is not consumed. Retry the same id only after reading `usedPaymentIds` and finding it false.
- A different payment id does not relax any other rule.
- The spending period is `block.timestamp / 1 days`. It resets at 00:00 UTC. It is not a rolling 24 hours or a calendar week. Changing the policy does not reset `spentInPeriod` or used ids.
- Pause blocks `executePayment` and `executePaymentIntent`. The owner can withdraw while paused. Unpause restores payments and does not change `policyVersion`.

## Token and chain

USDC is fixed at `0x3600000000000000000000000000000000000000` with 6 ERC-20 decimals on Arc mainnet (chain `5042`) and Arc Testnet (chain `5042002`). Native gas uses the same asset at 18 decimals. The vault accounts only the ERC-20 balance. Do not add the native balance to the ERC-20 balance.

The vault rejects a token that does not have 6 decimals at initialization, and it reverts if a transfer changes the balance by a different amount. `ReentrancyGuard` covers deposit, withdraw, and payment.

There is no `receive` or `fallback`. A native transfer to the vault reverts.

Addresses, RPC URLs, and the deployed factory are recorded in `docs/ARCBOND_NETWORK_CONFIGURATION.md`. The testnet factory used by the local app is `0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d`, deploy block `67052589`. Mainnet has no ArcBond factory in this repository.

## Signatures and remaining limits

`executePaymentIntent` verifies an EIP-712 signature from the current agent. That signature binds the vault, agent, recipient, token, amount, payment id, nonce, deadline, and policy version. It does not prove that an off-chain task was performed. The contracts do not rate-limit by session, support several agents, or recover a compromised agent key by themselves. The owner has to revoke that agent. A leaked owner key can change policy and withdraw. A leaked agent key can still call `executePayment` or sign new intents for whatever the current policy allows.

The factory at `0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d` was deployed before intent support. Its clones do not expose `executePaymentIntent`. Intent payments use the version 2 factory `0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793`. Existing version 1 balances stay in those vaults. Mainnet has no ArcBond factory.

The intent relay in `services/payments` can submit a signed intent and pay its own gas. It is not a spending authority. It cannot change the signed recipient, amount, or payment id, and the provider does not treat relay acceptance as settlement. The provider reads `PaymentExecuted` and `usedPaymentIds` from the configured chain.

## Workspaces and sessions

`ArcBondWorkspace` is a separate clone. It does not change vault factory version 1 or version 2, and it does not custody those vaults' USDC. Its shared UTC-day cap and session reservations are enforced only for funds held by that workspace. A browser grouping of older vaults is not a shared cap.

A session locks its budget in `reserved` before any voucher is settled. `settleSession` pays only the increase over the cumulative amount already settled. Revoking an agent or changing policy bumps `policyVersion`, and an open session keeps the version from when it was opened, so older vouchers cannot settle. The owner can still close the session and withdraw USDC that is not reserved. Pause blocks payments and settlement. It does not give the guardian a key. A usage voucher does not prove that a provider delivered a service.

Tests use a mock USDC except for the optional fork file. Mock behavior is not a claim about Circle's USDC implementation beyond the ERC-20 surface the vault calls.
