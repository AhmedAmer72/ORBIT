/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly NEXT_PUBLIC_ARC_CHAIN_ID?: string;
  readonly NEXT_PUBLIC_ARC_RPC_URL?: string;
  readonly NEXT_PUBLIC_ARC_EXPLORER_URL?: string;
  readonly NEXT_PUBLIC_USDC_ADDRESS?: string;
  readonly NEXT_PUBLIC_FACTORY_ADDRESS?: string;
  readonly NEXT_PUBLIC_FACTORY_DEPLOY_BLOCK?: string;
  readonly NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?: string;
  readonly NEXT_PUBLIC_PRIVY_APP_ID?: string;
  readonly NEXT_PUBLIC_PRIVY_CLIENT_ID?: string;
  readonly NEXT_PUBLIC_PAY_API_URL?: string;
  readonly NEXT_PUBLIC_WORKSPACE_FACTORY_ADDRESS?: string;
  readonly NEXT_PUBLIC_WORKSPACE_DEPLOY_BLOCK?: string;
  readonly NEXT_PUBLIC_GUARDIAN_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
