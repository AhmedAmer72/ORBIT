# Pay-per-API and the intent relay

Agents authorize an exact payment. The relay submits it. The vault enforces the policy. The provider delivers the record only after it sees settlement.

This is one path, not two demos. The reference service sells a public Arc network record for 0.50 USDC. The price and the recipient are fixed by the provider. The agent cannot choose a cheaper amount, and the relay cannot rewrite the signed fields.

## What is live

| Generation | Where | Payment intents |
| --- | --- | --- |
| Version 1 | Arc Testnet factory `0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d`, deploy block `67052589` | No. Those clones stay as they were. |
| Version 2 | Arc Testnet factory `0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793`, deploy block `67213321` | Yes. The app now points here. |

Editing the source does not change the version 1 deployment. The provider reads `VERSION()` and refuses to quote when the factory does not report intent support. `PAY_FACTORY_ADDRESS` and `NEXT_PUBLIC_FACTORY_ADDRESS` now use the version 2 factory.

The local Anvil test is still the offline proof. On 14 October 2026 a live Arc Testnet payment also settled: transaction `0x35f365c46364842b74170d9a31e0edabbc8414eae3a9d2c1b0b405b128055a45`. The relayer submitted it. The provider returned the Arc Testnet record only after reading the vault log.

## Parties

| Party | Key | What it may do |
| --- | --- | --- |
| Owner | Owner key, never sent to the agent or the relay | Fund the vault, set policy, allowlist the provider, authorize one agent, revoke, pause, withdraw |
| Agent | Agent key, used only to sign the intent | Sign the quoted payment. It does not submit the Arc transaction in this flow |
| Relay | `PAY_RELAYER_PRIVATE_KEY` | Submit `executePaymentIntent` and pay gas. It does not gain spending rights |
| Provider | Recipient address | Quote a price and release the record after reading the vault |

The owner key is not an input to `npm run pay:api` or `npm run pay:agent`. The server loads `PAY_*` values only. The agent script does not load `.env`.

## Service

`arc-network-record` returns the public chain id, RPC, explorer, and USDC address for `testnet` or `mainnet`. The payload is reference data already in this repository. The demonstration is the gate, not secrecy.

Price: `500000` base units, displayed as `0.50` USDC. The token is Arc USDC `0x3600000000000000000000000000000000000000`.

## Payment path

1. The client asks `POST /provider/quotes` with a vault address and `record`.
2. The provider stores a quote: recipient, amount, `paymentId`, and expiry. It does not include a nonce or a policy version.
3. The agent reads the vault with `createPaymentIntent` and signs that exact quote. Nonce and policy version come from the chain.
4. The agent sends the signed intent to `POST /relay/intents`.
5. The relay checks the signature, the quote, and a simulation. It submits only when the simulation passes.
6. The agent calls `POST /provider/deliveries` with the quote id.
7. The provider searches `PaymentExecuted` for that payment id, checks the recipient and amount, requires `usedPaymentIds` to be true, and requires a successful receipt.
8. Only then does it return the record and store the delivery.

A signature, a relay row, or a transaction hash supplied by the caller does not unlock the record. An unpaid quote returns HTTP 402.

## Relay rules

The relay rejects a request before spending gas when:

- the chain id is not the configured Arc chain
- the digest does not match the intent
- the recovered signer is not the named agent
- the signature is not a 65-byte hex value
- the vault, recipient, token, amount, or payment id differs from the quote
- the quote is expired, or the intent deadline is later than the quote expiry
- the body is larger than 32 KB, or the caller exceeds 60 requests in a minute

If the vault simulation reverts, the relay stores `simulation_reverted` and does not send a transaction. A confirmed digest is not submitted again. The vault still checks the signature, the agent, the pause flag, expiry, the policy version, the nonce, the caps, the allowlist, and the payment id.

The relayer pays gas from its own account. This does not make the USDC payment free, and it does not bypass the vault.

## Run the local proof

The integration test starts Anvil, etches a 6-decimal USDC at the Arc USDC address, deploys factory version 2, funds a vault, and runs the path above. It uses the public Anvil development keys. Do not fund those keys on Arc.

```bash
npm run test:contracts
npm test -w @arcbond/payments
```

`npm run test:contracts` is required first because the test deploys the Forge artifact. On 14 October 2026 that test file passed 8 tests. The settled payment moved `500000` base units from the vault to the provider. The transaction sender was the relayer, not the agent. A second submission of the same intent left `intentNonce` at 1.

## Run the services against a version 2 factory

Deploy version 2 only after an operator explicitly approves a broadcast. `script/Deploy.s.sol` prints the factory, the implementation, and `version`. Then set the untracked environment:

```bash
PAY_RPC_URL=http://127.0.0.1:8545
PAY_CHAIN_ID=5042002
PAY_FACTORY_ADDRESS=0x...
PAY_PROVIDER_RECIPIENT=0x...
PAY_RELAYER_PRIVATE_KEY=0x...
PAY_START_BLOCK=0
NEXT_PUBLIC_PAY_API_URL=http://127.0.0.1:8787
```

The provider recipient has to be allowlisted on the vault. The agent has to be authorized, the vault has to hold at least 0.50 USDC, and the caps have to allow that payment. The relayer account needs gas. On Arc, gas is USDC and the fee floor in the SDK is 20 gwei.

```bash
npm run pay:api
```

In another shell, without putting the owner key in the command:

```bash
set AGENT_PRIVATE_KEY=0x...
set VAULT_ADDRESS=0x...
set PAY_API_URL=http://127.0.0.1:8787
set PAY_RPC_URL=http://127.0.0.1:8545
npm run pay:agent
```

The dashboard page is `/app/pay`. Connect the agent wallet, not the owner wallet. The page can request a quote and ask that wallet to sign. It shows the record only when the provider returns it.

## What this does not prove

Passing the local test is not an audit and not an Arc Testnet receipt. The version 1 vaults already deployed keep their code and their USDC. A leaked agent key can still sign new intents inside the current policy, or call `executePayment` directly. Revocation and the caps are what stop that. The relay does not rate-limit by identity beyond a per-address request count, and it does not hide a compromised agent key.
