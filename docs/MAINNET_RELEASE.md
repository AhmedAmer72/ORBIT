# ArcBond mainnet release

Status: **factories deployed**. No vault was created and no USDC payment was sent.

Verification date: **15 October 2026**.

## Network, checked directly

| Check | Result | Source |
| --- | --- | --- |
| Mainnet chain id | `5042` (`0x13b2`) | `eth_chainId` on `https://rpc.mainnet.arc.io` |
| Testnet chain id | `5042002` (`0x4cef52`) | `eth_chainId` on `https://rpc.testnet.arc.io` |
| USDC | `0x3600000000000000000000000000000000000000` | [Contract addresses](https://docs.arc.io/arc/references/contract-addresses), mainnet tab selected |
| USDC `decimals()` | `6` on both RPCs | `eth_call` |
| USDC code | present on both RPCs | `eth_getCode` |
| Native gas | USDC, 18 decimals | [EVM differences](https://docs.arc.io/arc/references/evm-differences), already used by this repo |
| Explorer candidates | `https://explorer.arc.io`, `https://explorer.testnet.arc.io` | Existing repo network note, not re-fetched as HTML in this pass |

The docs home page stated that Arc mainnet is live. The RPC chain id matches the documented mainnet id.

## Release scope

Included, after approval:

- `ArcBondVaultFactory` version 2, which deploys the intent-capable vault implementation in its constructor.
- No vault is created, funded, or paid during deployment.

Excluded from this launch:

- Workspace and metered-session factory. It is implemented and unit-tested, and an empty workspace exists on testnet, but it has no public testnet payment receipt. It stays on testnet.
- Policy Guardian automatic pause or revoke. The page only reads logs.
- A hosted website or payments service. Nothing here was published to a public host.
- Any USDC deposit, approval, or payment. Deployment gas is native USDC. It is not an ERC-20 transfer.

## Deployment manifest

Checked again on 15 October 2026 against `https://rpc.mainnet.arc.io`. Chain id `5042`. Deployer `0x39B6fd99d31A67475911D9d763B0Bd8323f99685`. Native balance `2` USDC. No token approval and no USDC transfer. Gas is native USDC.

| Order | Contract | Version | Estimated gas | Estimated cost |
| --- | --- | --- | --- | --- |
| 1 | `ArcBondVaultFactory` | 2 | `2134497` | `0.076841882953289588` |
| 2 | `ArcBondWorkspaceFactory` | 1 | `3061777` | `0.110223964236274196` |
| | Total | | | `0.187065847189563784` |

Approved ceiling: **0.40** native USDC. Actual spend from the two receipts: **0.108213882** native USDC.

| Contract | Address | Transaction | Block | Paid |
| --- | --- | --- | --- | --- |
| `ArcBondVaultFactory` version 2 | `0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d` | `0xed3ec4feb1165e858d37c231eaee0c9343431e915aaa11e4ca95bbb16a28997f` | `26000245` | `0.044447172` |
| Implementation | `0xf37409Cd3d158E1B8f88678CB711dbc206B45781` | created inside the factory transaction | | |
| `ArcBondWorkspaceFactory` version 1 | `0x8fb1a3cff48ec873ef0526a902425813979c7b9e` | `0x2d39671efa37c2ba0241485839a7ffdb2ec9fb80a29275f34cc3e442b3567fe3` | `26000255` | `0.06376671` |
| Workspace implementation | `0x3be6031B7473F334D75ae69AEeCABa87ec3D93d3` | created inside the workspace factory transaction | | |

Read back on chain `5042`: vault factory `VERSION()` is 2 and both factories have code. The vault factory address is the same text as the testnet version 1 factory because both were this deployer's first contract on that chain. The mainnet bytecode is the version 2 factory. The testnet contract at that address was not modified.

Explorer source verification was not submitted. The local app `.env` public chain and factory fields now point at these mainnet addresses. `PAY_*` was left on testnet so the relayer cannot start spending mainnet gas. No website host was configured.

`scripts/deploy-mainnet.mjs` reads the chain id from that RPC, checks USDC decimals, prints this estimate, and exits without broadcasting unless `ARC_MAINNET_DEPLOY=approved`. That variable is not set.

Testnet deploy scripts now abort unless the RPC reports chain `5042002`.

## Integration

The public app fields in `.env` point at Arc mainnet and the factories above. `PAY_*` stays on testnet, so the relayer cannot start spending mainnet gas. The payments service refuses a known testnet factory when `PAY_CHAIN_ID=5042`, and it refuses a mainnet relayer until `PAY_RELAY_MAX_NATIVE` is set. That cap is intentionally unset.

## Tests this pass

`npm run test:contracts`: 83 passed, 1 skipped. The skip is the existing Arc USDC fork test.

SDK, web, and payments suites were not re-run in this pass after the payments config guard. The guard is a startup check and does not change the testnet path when `PAY_CHAIN_ID` is `5042002`.

## Not done

- Explorer source verification was not submitted.
- No mainnet vault was created, funded, or paid.
- No public frontend or backend host.
- The payments relay is not enabled on mainnet.
- This is not an independent audit.
