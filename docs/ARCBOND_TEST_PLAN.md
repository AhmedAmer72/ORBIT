# ArcBond Test Plan

A feature is accepted when the named check passes in contract tests for the rule, and on a real Arc network for the public demo.

Rejected payments must revert with the matching custom error and move no USDC. The UI may show a local preflight failure or a reverted receipt. It must not claim every denial is stored on-chain.

## Commands

From the repository root, after the toolchain exists:

```bash
npm run test:contracts
npm run test:contracts:fork
npm run typecheck
npm run lint
npm test
npm run build
```

Equivalents inside `contracts/`:

```bash
arc-forge test
arc-forge test --match-path test/fork --fork-url https://rpc.testnet.arc.io
```

If `arc-forge` is not on `PATH`, `forge` with `evm_version = "osaka"` may run unit tests. Fork tests that depend on the USDC precompile or the testnet blocklist require Arc Foundry or a live Arc RPC fork.

Vanilla Anvil does not reproduce Arc-specific USDC behavior.

## Contract unit tests (`contracts/test/ArcBondVault.t.sol`)

Use a 6-decimal mock etched at `0x3600000000000000000000000000000000000000`.

| Case | Expected |
| --- | --- |
| Factory create | `VaultCreated` owner is the caller; `isVault` is true; `vaultsOf` contains the clone |
| Implementation initialize | Second `initialize` reverts; implementation itself is not initializable |
| Deposit | Owner ERC-20 balance falls by `amount`; vault `balanceOf` rises by `amount`; anyone may deposit |
| Deposit zero | Reverts `ZeroAmount` |
| Authorized payment | Recipient balance rises; `PaymentExecuted` fields match |
| Unauthorized agent | Reverts `UnauthorizedAgent` |
| Zero amount payment | Reverts `ZeroAmount` |
| Per-payment cap exceeded | Reverts `AmountExceedsLimit` |
| Zero caps | Any payment reverts (`AmountExceedsLimit` or `PeriodLimitExceeded`) |
| Period cap exceeded | Reverts `PeriodLimitExceeded` |
| Period boundary | After warp to the next UTC day, `spentInPeriod` resets and a new payment can succeed |
| Policy update does not reset spend | After a payment, lowering or rewriting policy still counts prior spend in the same window |
| Recipient not approved | Reverts `RecipientNotApproved` |
| Empty allowlist | Payment reverts |
| Cannot approve zero or self | Reverts `InvalidRecipient` |
| Duplicate payment id | Reverts `PaymentIdUsed` |
| Zero payment id | Reverts `ZeroPaymentId` |
| Expired authorization | Reverts `AuthorizationExpired` |
| Revoked agent | Reverts `UnauthorizedAgent`; revoke does not need the agent key |
| Paused vault | `executePayment` reverts `VaultPaused`; `withdraw` still works |
| Unauthorized policy / recipient / pause / withdraw | Non-owner reverts |
| Owner withdraw | Vault balance falls; owner balance rises by the same amount |
| Agent cannot withdraw | Reverts |
| Failed / short token transfer | Reverts `TransferAmountMismatch` or SafeERC20 error; payment id remains unused if the call reverts |
| Reentrancy | Callback cannot execute a second payment |
| Native value to vault | Reverts (no receive/fallback) |
| Deposit with `msg.value` | Reverts |
| Owner cannot be agent | Reverts `InvalidAgent` |
| Two-step ownership | Owner unchanged until accept; new owner can withdraw |
| Wrong token decimals | Implementation constructor reverts `InvalidTokenDecimals` |

## Fork tests (`contracts/test/fork/ArcUsdc.t.sol`)

Skip when `vm.activeFork()` is unavailable so `arc-forge test` stays green offline.

When run with `--fork-url https://rpc.testnet.arc.io` (`npm run test:contracts:fork`):

Vanilla Foundry can read `decimals()` and the shared native/ERC-20 balance. `transfer` / `transferFrom` call Arc's `isBlocklisted` precompile (`0x1800…0001`) and revert with `StackUnderflow` unless you use `arc-forge`. Those two cases skip on standard `forge`.

| Case | Expected |
| --- | --- |
| USDC `decimals()` | `6` |
| Shared balance | Native deal of `1e18` corresponds to ERC-20 `balanceOf` of `1e6` (factor `1e12`) |
| Real deposit | `transferFrom` into a freshly created vault increases `balanceOf(vault)` by the ERC-20 amount |
| Blocklist fixture | Payment or transfer involving `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` reverts and leaves payment id unused |

## SDK and frontend tests

| Case | Expected |
| --- | --- |
| Decode custom errors | Known selectors map to the Solidity error names |
| Format USDC | 6-decimal base units render as decimal strings; never mix 18-decimal native units |
| Fee floor | Helper returns at least 20 gwei |
| Wrong network | Writes disabled when chain id is not the configured Arc id |
| Simulation failure | Rendered as a rejection, not a successful payment |
| Missing factory address | Configuration-missing state, no sample vaults |
| Missing logs | Error or empty state, no fabricated hashes |

## Mainnet (or testnet) integration verification

Do this only after an explicit broadcast confirmation and a local key.

1. Query `eth_gasPrice` / `eth_feeHistory`. Set `maxFeePerGas` to at least 20 gwei and at least the quote.
2. Deploy implementation (via factory constructor) and factory. Record addresses, block, and tx hash.
3. Verify source on Blockscout when the verifier URL is confirmed.
4. Confirm on-chain `USDC` equals `0x3600000000000000000000000000000000000000` and `decimals() == 6`.
5. Create a vault. Deposit a minimal amount.
6. Set a small per-payment cap, period cap, one recipient, and an expiry.
7. Authorize an agent wallet that is not the owner.
8. Run overview scenarios A–F: allowed payment; over cap; unapproved recipient; period exhausted; duplicate id; revoke then pay.
9. Pause and withdraw remaining funds.
10. Confirm the dashboard shows the same balances and hashes as the explorer.

Use very small balances. Do not describe an unaudited prototype as production-ready.

## Acceptance criteria (MVP)

| Feature | Status to reach | Acceptance |
| --- | --- | --- |
| Wallet on Arc | Missing → required | Injected account on chain 5042 signs; any other chain shows switch and submits no write |
| Create vault | Missing → required | `VaultCreated` owner is the signer; `isVault` is true |
| Deposit USDC | Missing → required | Owner ERC-20 falls and vault `balanceOf` rises by the same amount |
| Policy | Missing → required | Stored caps and recipients match the confirmed transaction |
| Authorize agent | Missing → required | Only that address can pay before `expiresAt` |
| Allowed payment | Missing → required | Recipient balance rises; `PaymentExecuted` matches the receipt; explorer link opens |
| Reject oversize / bad recipient / replay / revoked / expired / paused | Missing → required | Matching custom error; no USDC movement |
| Pause and withdraw | Missing → required | Owner withdraws while paused; agent cannot withdraw |
| History | Missing → required | Only receipts and events the RPC returned |
| Docs and demo script | Missing → required | README lets a second person deploy to testnet without the author's key |

## Static analysis and hygiene

- `forge fmt --check` (or `arc-forge fmt --check`)
- `npm run lint` and `npm run typecheck`
- Optional later: Slither / an independent review before balances beyond the demo

## Release checklist

- Clean unit and (when RPC is available) fork test run
- Source verified, or explicitly unverified with a reason
- Chain id and USDC constant checked on-chain
- Demo transactions linked
- No private keys in git
- Empty factory address shows configuration-missing
- Wrong-network state checked
- UI describes a fixed 00:00 UTC reset, not a rolling 24-hour window
