import type { PrivyClientConfig, WalletListEntry } from "@privy-io/react-auth";
import { chainById } from "@arcbond/sdk";

import { appConfig } from "./config";

const chain = chainById(appConfig.chainId);

const walletList: WalletListEntry[] = appConfig.walletConnectProjectId
  ? ["metamask", "detected_wallets", "wallet_connect"]
  : ["metamask", "detected_wallets"];

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["wallet"],
  appearance: {
    theme: "#07111F",
    accentColor: "#2563EB",
    landingHeader: "Connect a wallet",
    loginMessage: "This address is the vault owner.",
    showWalletLoginFirst: true,
    walletChainType: "ethereum-only",
    walletList,
  },
  embeddedWallets: {
    ethereum: { createOnLogin: "off" },
  },
  defaultChain: chain,
  supportedChains: [chain],
  ...(appConfig.walletConnectProjectId
    ? { walletConnectCloudProjectId: appConfig.walletConnectProjectId }
    : {}),
};
