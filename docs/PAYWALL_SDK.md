# Paywall SDK

`createArcBondPaywall` in `@arcbond/sdk` stores a quote and later checks the quoted contract for a matching `PaymentExecuted` log. A browser message, a relay status, or a loose USDC transfer does not satisfy the quote.

The quote binds the chain, vault or workspace address, Arc USDC, recipient, amount, and a payment id derived from the service id and request id. The same request returns the same unexpired quote. An expired quote can be replaced. The payment id stays the same, so a retry does not create a second settlement id.

`verifyPayment` reads logs from the quoted address, checks `usedPaymentIds` for one-shot vault payments, and requires a successful receipt. Workspace session settlements emit `PaymentExecuted` but do not set `usedPaymentIds`; use the session's `settled` balance for those, not this helper. The helper is for the direct payment id path.

## Example

`services/paywall-example` is a two-route API.

```bash
set PAYWALL_VAULT=0x...
set PAYWALL_RECIPIENT=0x...
set PAYWALL_FROM_BLOCK=0
npm run paywall:example
```

`POST /quote` with `{ "serviceId": "data-lookup", "requestId": "req-1", "amount": "0.50" }` returns the quote. The agent pays that exact amount to that recipient with that payment id, through a version 2 vault or a workspace `executePayment`. `POST /lookup` with `{ "quoteId": "..." }` returns the record only after verification. Before payment it returns HTTP 402.

The existing Pay-per-API service in `services/payments` remains the relayed intent path. It keeps its own SQLite quotes. The SDK is the reusable checker and quote binder.
