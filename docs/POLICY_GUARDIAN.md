# Policy guardian

`npm run guardian` indexes configured workspace addresses and applies the rules in `packages/sdk/src/guardian.ts`.

It reads `PaymentExecuted` and `AgentRevoked` logs, plus the current period limit, spent and reserved totals, and available balance. Relay failure alerts appear only when the caller supplies `relay_failure` facts. The service does not treat a reverted transaction as a stored log, because a revert leaves none.

`GET /health` is not success when indexing has not run or the RPC call failed. An empty alert list in that state is missing data. `/app/guardian` shows that status. Set `NEXT_PUBLIC_GUARDIAN_URL` to `http://127.0.0.1:8788`.

`GUARDIAN_WORKSPACES` is a comma-separated list of workspace addresses. `GUARDIAN_FROM_BLOCK` bounds the first scan. State is written to `services/guardian/data/state.json` and survives a restart.

Acknowledge marks an alert read. It does not pause a workspace. Pause and revoke are still owner transactions from `/app/workspaces`. The guardian has no key.

Thresholds live in `defaultGuardianThresholds`. A near-budget signal means indexed spending plus reservations crossed the configured fraction of the on-chain limit. It is not a claim that the payment was unauthorized. The contract already allowed it.
