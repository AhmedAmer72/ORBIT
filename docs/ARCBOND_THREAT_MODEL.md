# ArcBond Threat Model

ArcBond constrains USDC that sits in a vault and leaves that vault only through `executePayment` or owner `withdraw`. It does not make an agent honest, a recipient legitimate, or an owner key safe. It does not govern USDC held outside the vault.

Each row is: threat, mitigation, residual risk, and the test that proves the mitigation.

## Compromised or manipulated agent

A stolen agent key or a prompt-injected agent can call `executePayment` or sign a new intent. The signature does not add authority beyond the current policy, and it does not prove an off-chain task. Revoke the agent to stop both paths.

**Mitigation.** The agent can spend only inside the per-payment cap, period cap, allowlist, expiry, unused payment ids, and unpaused state. The agent cannot change policy, add recipients, or withdraw.

**Residual risk.** The remaining allowance can still be stolen until the owner pauses, revokes, or the period expires.

**Test.** Agent pays an allowed transfer, then fails over cap, unapproved recipient, and replay (`ArcBondVault.t.sol`).

## Unauthorized recipient

The agent pays an address the owner never approved.

**Mitigation.** Empty allowlist rejects every payment. `setRecipient` is owner-only. `address(0)` and the vault cannot be approved.

**Residual risk.** An approved recipient can still be dishonest or fail to deliver a service.

**Test.** Payment to an unapproved address reverts `RecipientNotApproved`. Agent cannot call `setRecipient`.

## Duplicate and replayed requests

Retries, bugs, or an attacker reuse a payment identifier.

**Mitigation.** The id is marked used before the token transfer. Scope is per vault. Zero ids are rejected. Used ids survive revocation and policy updates.

**Residual risk.** A new id is not proof of a legitimate payment. All other rules still apply.

**Test.** Same id reverts `PaymentIdUsed`. A new id still faces every other rule.

## Spending-limit bypass

Attempts include raising the cap after spending, resetting policy, or racing the UTC boundary.

**Mitigation.** Policy updates do not clear `spentInPeriod` or payment ids. Period reset happens only when `block.timestamp / 1 days` changes.

**Residual risk.** Spending the full cap just before and just after 00:00 UTC is allowed by design.

**Test.** Spend, lower the policy, and show the old total still counts. Warp to the next UTC day and show the counter resets.

## Reentrancy and unexpected callbacks

A token or recipient tries to re-enter `executePayment` or `withdraw`.

**Mitigation.** OpenZeppelin `ReentrancyGuard` (zero storage is not `ENTERED`, so clones start unlocked). Checks-effects-interactions. No call to the recipient. Exact `balanceOf` delta after `safeTransfer`.

**Residual risk.** A future change that adds arbitrary external calls would reopen this path.

**Test.** A mock token that calls back cannot double-spend. A short transfer reverts `TransferAmountMismatch`.

## Malicious or unexpected token behavior

Non-standard return values, fee-on-transfer, blocklist reverts.

**Mitigation.** USDC address is a constant. Implementation constructor requires `decimals() == 6`. `SafeERC20` plus exact balance decrease. A USDC revert rolls back policy state.

**Residual risk.** Circle can change USDC runtime rules (blocklist, transfer restrictions) independently of ArcBond.

**Test.** Implementation deploy reverts when decimals are not 6. Fork test against the documented testnet blocklist fixture.

## Native-value bypass

An agent or third party moves the vault's native USDC without going through policy.

**Mitigation.** All functions are nonpayable. No `receive` or fallback. The agent has no path that uses `call{value:}`. ERC-20 allowance is not treated as a spending cap.

**Residual risk.** Another contract could `SELFDESTRUCT` native dust into the vault. That dust may be invisible to `balanceOf` and is not spendable through the vault.

**Test.** Sending native value to the vault reverts. `deposit` with `msg.value` reverts.

## Unauthorized policy change or withdrawal

A non-owner tries to loosen limits or take funds.

**Mitigation.** Owner-only modifiers on policy, recipients, agent management, pause, unpause, and withdraw. Agent is excluded from those functions.

**Residual risk.** Owner-key compromise allows full withdrawal and policy rewrite. Two-step transfer only prevents a typo during an intentional transfer.

**Test.** Agent calls to `updatePolicy`, `setRecipient`, `withdraw`, `pause`, and `transferOwnership` revert.

## Owner wallet compromise or lost key

The owner key can pause, revoke, change the agent, or withdraw.

**Mitigation.** Two-step ownership transfer. Pause and revoke are single owner transactions. Funds should be limited to what the owner is willing to lose.

**Residual risk.** A compromised owner is an unrecoverable admin. A lost owner key bricks the vault.

**Test.** `transferOwnership` does not change owner until `acceptOwnership`. Zero address cannot be accepted.

## Stale or misleading frontend data

RPC lag, a wrong cache, or a simulated success shown as a payment.

**Mitigation.** Writes depend on simulation plus receipt `status`. Activity lists only events the RPC returned. Missing logs show “history unavailable,” not sample rows. Failed simulation is not rendered as a payment.

**Residual risk.** A dishonest or partitioned RPC can hide recent events. Users should confirm explorer links.

**Test.** Frontend utilities treat a failed simulation as a rejection. Activity empty and error states have no placeholder hashes.

## Wrong network or token configuration

A wallet on Ethereum mainnet, or a copied USDC address from another chain.

**Mitigation.** UI and SDK require the configured chain ID (default `5042`). USDC is hardcoded in the contract. Dashboard writes are disabled off-chain.

**Residual risk.** A user can still send USDC to the wrong address from another wallet UI.

**Test.** Wrong chain id disables writes. Deployment reverts when token decimals are not 6.

## Replay and expiration errors

An expired agent keeps paying, or revocation is delayed.

**Mitigation.** `block.timestamp < expiresAt` is checked on every payment. Revoke zeros agent and expiry immediately.

**Residual risk.** Timestamp granularity is one second and may repeat across sub-second blocks. Ordering uses block number, not timestamp.

**Test.** Warped time past `expiresAt` reverts `AuthorizationExpired`. Payment after `revokeAgent` reverts `UnauthorizedAgent`.

## Unsafe deployment and initialization

A user initializes the implementation, or a clone is left uninitialized.

**Mitigation.** Implementation constructor sets initialized and checks decimals. Factory clone + `initialize(msg.sender)` is atomic. Second `initialize` reverts. Factory has no owner.

**Residual risk.** A factory deployed with a wrong implementation (if someone deploys a modified factory) would produce unsafe clones. Review the factory bytecode before funding.

**Test.** Second `initialize` reverts. A direct call to initialize the implementation reverts. The factory caller becomes owner.

## Underpriced gas and silent drops

`maxFeePerGas` below the Arc floor is dropped with no receipt.

**Mitigation.** Clients set `maxFeePerGas` to at least 20 Gwei and at least the queried fee. A transaction with no hash or no receipt is shown as unsent.

**Residual risk.** Mainnet floor may change. Query fees at broadcast time.

**Test.** Fee helper never returns below 20 Gwei.

## RPC and indexing failures

`eth_getLogs` range limits or provider outages.

**Mitigation.** No backend of record. The UI degrades to an explicit error. Contract state reads (`balanceOf`, policy getters) remain the source of truth for balances and permissions.

**Residual risk.** History may be incomplete even when the vault is healthy.

**Test.** Activity page has an error state with no fabricated rows.

## Out of scope

ArcBond does not claim:

- AI safety or correct agent reasoning.
- Recipient honesty or service delivery.
- Protection of the owner's EOA.
- Protection of USDC that never entered the vault.
- Availability of wallets, RPCs, or explorers.
