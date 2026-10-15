import { http, createConfig as createWagmiConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { createConfig as createPrivyConfig } from "@privy-io/wagmi";

import { chainById } from "@arcbond/sdk";

import { appConfig } from "./config";

const chain = chainById(appConfig.chainId);

const transports = {
  [chain.id]: http(appConfig.rpcUrl),
};

// Privy owns the connector list. The fallback must not use shimDisconnect:
// that flag calls wallet_requestPermissions and then eth_requestAccounts.
export const wagmiConfig = appConfig.privyAppId
  ? createPrivyConfig({
      chains: [chain],
      transports,
      ssr: false,
    })
  : createWagmiConfig({
      chains: [chain],
      connectors: [injected({ shimDisconnect: false })],
      transports,
      ssr: false,
    });

export const configuredChain = chain;
