import { EmptyState } from "./EmptyState";

export function ConfigMissing() {
  return (
    <EmptyState title="Factory address is not configured">
      <p>
        Set <code className="font-mono text-paper">NEXT_PUBLIC_FACTORY_ADDRESS</code> to the deployed vault factory
        before Orbit can list vaults.
      </p>
      <p>This screen will not invent vaults, balances, or transaction hashes.</p>
    </EmptyState>
  );
}
