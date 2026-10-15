import type { Address } from "viem";

import { parseUsdc, paymentIdFromLabel, type PaymentRequest } from "../src/index";

/// A payment request shaped for ArcBondVault.executePayment.
/// Amounts are 6-decimal base units. The label becomes keccak256(utf8), scoped to one vault.
/// Reusing a fresh id does not bypass the contract's agent, cap, allowlist, or pause checks.
export function examplePaymentRequest(vault: Address): PaymentRequest {
  return {
    vault,
    recipient: "0x3333333333333333333333333333333333333333",
    amount: parseUsdc("0.01"),
    paymentId: paymentIdFromLabel("invoice-1"),
  };
}
