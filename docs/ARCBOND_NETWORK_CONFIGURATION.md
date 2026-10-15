# ArcBond Network Configuration

Verification date: **13 October 2026**.

This file records official Arc and Circle facts used by ArcBond. Do not copy a token address, chain ID, or RPC URL from another chain. If a value cannot be re-verified, treat it as unverified and resolve it before deployment.

## Sources

Fetched or confirmed on 13 October 2026:

| Topic | Source |
| --- | --- |
| Chain metadata, RPC, explorer, USDC ERC-20 address | [Infrastructure Integration](https://docs.arc.io/integrate/infrastructure) |
| USDC address, decimals, related contracts | [Contract addresses](https://docs.arc.io/arc/references/contract-addresses) |
| Native vs ERC-20 USDC, value-transfer rules, fee floor, timestamps | [EVM differences](https://docs.arc.io/arc/references/evm-differences) |
| Fee market, `maxFeePerGas` floor, testnet-parameter caveat | [Gas and fees](https://docs.arc.io/arc/references/gas-and-fees) |
| Wallet add-network fields, viem/wagmi samples | [Connect to Arc](https://docs.arc.io/integrate/connect-to-arc) |
| Testnet deploy and Blockscout verify | [Deploy on Arc](https://docs.arc.io/arc/tutorials/deploy-on-arc) |
| Balance display, allowances, history emitter | [Wallet integration](https://docs.arc.io/integrate/wallets) |
| Additional RPC providers | [RPC endpoints](https://docs.arc.io/arc/references/rpc-endpoints) |
| Arc Foundry install (Unix-like shell, WSL on Windows) | [Install Arc Foundry](https://docs.arc.io/arc/tutorials/install-arc-foundry) |
| Testnet faucet | [Circle Faucet](https://faucet.circle.com) |

## Verified mainnet

| Parameter | Value |
| --- | --- |
| Network name | Arc |
| Chain ID | `5042` |
| HTTP RPC | `https://rpc.mainnet.arc.io` |
| WebSocket | `wss://rpc.mainnet.arc.io` |
| Block explorer | `https://explorer.arc.io` |
| Native currency symbol | USDC |
| Native decimals (`eth_getBalance`, `msg.value`) | 18 |
| USDC ERC-20 address | `0x3600000000000000000000000000000000000000` |
| USDC ERC-20 decimals | 6 |
| CCTP domain | `26` |
| EVM target | Osaka |
| Finality | Deterministic on inclusion |

The primary Circle HTTP endpoint accepts anonymous requests and open CORS. Third-party RPCs (Alchemy, Blockdaemon, dRPC, QuickNode) may require their own keys.

## Verified testnet

| Parameter | Value |
| --- | --- |
| Network name | Arc Testnet |
| Chain ID | `5042002` |
| HTTP RPC | `https://rpc.testnet.arc.io` |
| WebSocket | `wss://rpc.testnet.arc.io` |
| Block explorer | `https://explorer.testnet.arc.io` |
| Faucet | `https://faucet.circle.com` |
| USDC ERC-20 address | `0x3600000000000000000000000000000000000000` |
| Testnet source verification | Blockscout at `https://explorer.testnet.arc.io/api/` |
| Testnet blocklist fixture | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |

The blocklist fixture is documented for Arc Testnet only. Do not assume it is blocklisted on mainnet.

Testnet verification command from official docs:

```bash
arc-forge verify-contract $ADDRESS src/ArcBondVault.sol:ArcBondVault \
  --chain-id 5042002 \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.arc.io/api/
```

## USDC model (security-critical)

USDC is the native gas token and the vault asset. One balance, two views:

- Native view: `eth_getBalance`, `address.balance`, `msg.value` — 18 decimals.
- ERC-20 view: `balanceOf`, `transfer`, `transferFrom`, `approve` — 6 decimals at `0x3600000000000000000000000000000000000000`.

There is no wrapped USDC. ERC-20 `approve` / `allowance` constrain only `transferFrom`. A native value transfer bypasses allowance.

Conversion factor: `1` ERC-20 unit = `10^12` native units.

`balanceOf == 0` does not prove the native balance is zero. Sub-atomic native dust is truncated in the ERC-20 view.

ArcBond vaults accept deposits only through the 6-decimal ERC-20 interface. All contract amounts, SDK amounts, and dashboard amounts are 6-decimal base units. The UI shows one wallet balance from `balanceOf` and labels gas as USDC. It never adds the two views together.

## Transfer events

- System emitter `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` logs native USDC transfers at 18 decimals (EIP-7708).
- An ERC-20 `transfer` also logs at the USDC address at 6 decimals.
- Filtering both emitters double-counts ERC-20 transfers.
- Gas deductions do not emit a Transfer log.

ArcBond activity history uses vault events (`PaymentExecuted`, `Deposited`, `Withdrawn`, and authorization events), not a raw USDC Transfer index.

## Fees and wallets

- EIP-1559 wallets can sign. Some wallets still label the gas token as ETH. Display fees as USDC.
- [EVM differences](https://docs.arc.io/arc/references/evm-differences) states that transactions with `maxFeePerGas` below 20 Gwei are dropped and produce no receipt.
- [Gas and fees](https://docs.arc.io/arc/references/gas-and-fees) documents 20 Gwei as the **testnet** minimum base fee and says numeric parameters may differ on mainnet.
- Client rule: submit at least `max(20 gwei, queried base fee)`. Query `eth_gasPrice` and `eth_feeHistory` before a mainnet broadcast.
- Do not copy the official gas-page snippet that sends native value with `parseUnits("1", 6)`. Native value is 18 decimals.

## Tooling

- Solidity, Foundry-family tools, viem, ethers.js, and standard Ethereum wallets are supported.
- Vanilla Anvil does not reproduce the USDC precompile, blocklist, or decimal split. Use `arc-anvil --network arc` when Arc Foundry is installed.
- Official install (13 October 2026): download a release archive from the [Arc Foundry releases page](https://github.com/circlefin/arc-foundry/releases), extract, and install as `arc-forge`, `arc-cast`, `arc-anvil`. Requires a Unix-like shell. Windows uses WSL and the Linux binary. Intel Mac must build from source.
- `PREVRANDAO` is always `0`. Block timestamps are non-decreasing and may repeat within one second. Use block number for ordering.
- `CREATE2` factory on both networks: `0x4e59b44847b379578588920cA78FbF26c0B4956C`.
- Multicall3 on both networks: `0xcA11bde05977b3631167028862bE2a173976CA11`.

Do not reuse the `arcup` Arc **node** installer as if it installed Foundry.

## Environment variables

Committed only as `.env.example`:

```
NEXT_PUBLIC_ARC_CHAIN_ID=5042002
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.io
NEXT_PUBLIC_ARC_EXPLORER_URL=https://explorer.testnet.arc.io
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
NEXT_PUBLIC_FACTORY_ADDRESS=
NEXT_PUBLIC_FACTORY_DEPLOY_BLOCK=
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_PRIVY_APP_ID=
```

The running app uses these testnet values when the variables are unset. Mainnet constants remain in the SDK for a later release.

Untracked local files may hold `PRIVATE_KEY` (deployer) and `AGENT_PRIVATE_KEY`. Never commit them.

Until `NEXT_PUBLIC_FACTORY_ADDRESS` is set, the dashboard shows a configuration-missing state. It does not invent a factory or balances.

The public testnet RPC rejects `eth_getLogs` ranges above 10,000 blocks. On 14 Oct 2026 a 10,000-block span succeeded and a 50,000-block span failed with `requested range too large`. Activity queries from `NEXT_PUBLIC_FACTORY_DEPLOY_BLOCK` in 10,000-block windows.

## Unverified (blocking the named step)

| Item | Status | Blocks |
| --- | --- | --- |
| Exact current Arc Foundry release asset URL for this machine | Releases page must be opened at install time. Latest checked: [v0.8.0-2](https://github.com/circlefin/arc-foundry/releases/tag/v0.8.0-2) (Linux x86_64/arm64, macOS Apple Silicon). | First install of Arc Foundry |
| Native Windows (non-WSL) Arc Foundry binary | Official docs require WSL. This Windows host has a broken WSL disk (`ERROR_PATH_NOT_FOUND`). Local unit tests use Foundry v1.8.5 (`forge`) instead. | Arc-specific precompile tests until WSL or a Unix host is available |
| Mainnet Blockscout API URL | Explorer `https://explorer.arc.io` is verified; `/api/` is not | Mainnet source verification |
| Live mainnet base fee | Must query RPC at broadcast time | Mainnet deploy and payments |
| Whether `https://raw.githubusercontent.com/circlefin/arc-foundry/main/install` is an official installer | Not on the fetched install page | Do not use this URL unless the official page adds it |

## Deployment record

Fill this table after a real deployment. Leave it empty until then.

| Network | Implementation | Factory | Deploy block | Deploy tx | Verified |
| --- | --- | --- | --- | --- | --- |
| Arc Testnet v1 (`5042002`) | `0xf37409Cd3d158E1B8f88678CB711dbc206B45781` | `0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d` | `67052589` | `0x2ce53d11e8d304f9e1783ba05df96b95b766086481ce7a0512d39aa4b1d87823` | Blockscout. No payment intents. Left in place. |
| Arc Testnet v2 (`5042002`) | `0x00c1f5E6e6bF62924af5FD22234c54a04D3201CE` | `0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793` | `67213321` | `0x818d63fd71d32d145e60e971f8553b258c7dce0bb1958e155303856d7001aec4` | Factory verified on Blockscout. `VERSION()` is 2. |
| Arc Mainnet (`5042`) | | | | | |

Version 1 proof vault `0x7bb7A6e2b1E44F2ad336A6e4644E1e78dB7023CD`, owned by `0x39B6fd99d31A67475911D9d763B0Bd8323f99685`. The agent address used for scenarios is `0x7a6138e14Da5b1C16ab5267b2309135FFAE43387`. It was revoked after the payment, and the vault was withdrawn and unpaused. That vault cannot execute intents.

Version 2 vault `0xDA9889938B7758c484Fb5972D2569c5865689e50` was created in `0x9a1b006f5dc5f2b6885c1eb96e58fd29bed53dbb70c2731af8cc7a27ef8e8378`. The same owner and agent are authorized. The provider recipient is the owner. The relayer is `0x0c6Fa7Be1AE160f3AC2aDBeb92a9936ea5873E15`. A 0.50 USDC intent settled in `0x35f365c46364842b74170d9a31e0edabbc8414eae3a9d2c1b0b405b128055a45` at block `67214188`. The sender was the relayer. `intentNonce` moved to 1 and the vault balance fell from 1.00 USDC to 0.50 USDC.

- Create: `0xca7f91831bc22ef56cca49b06ddf9f87f4d59acf404035dc455a21329e3a6a83`
- Deposit: `0xdf75377cd185082123cf359343e9ff7c79a904c67884ff87b79a12912be08cbe`
- Allowed payment: `0x536eefa7576c00c11f47799f0d8ff676464b06a1732fe33c257b1ad10d7c3eed`
- Withdraw: `0x2a5320baa3da17f4393bcc1ea90bbcfee5b7948f72479cf4326142c320df739c`

Oversized, unapproved, period-cap, replay, revoked, and agent-withdraw calls reverted with the contract error and did not move USDC.
