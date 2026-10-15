export type GuardianSeverity = "info" | "watch" | "urgent";

export type GuardianFact = {
  id: string;
  kind:
    | "payment"
    | "relay_failure"
    | "session_settled"
    | "near_limit"
    | "expiring"
    | "revoked"
    | "low_balance";
  at: number;
  subject: string;
  amount?: bigint;
  limit?: bigint;
  detail?: string;
};

export type GuardianAlert = {
  id: string;
  rule: string;
  severity: GuardianSeverity;
  at: number;
  subject: string;
  explanation: string;
  evidence: string;
  suggestion: string;
};

export type GuardianThresholds = {
  budgetFractionBps: number;
  paymentsInWindow: number;
  windowSeconds: number;
  relayFailures: number;
  expiryWarningSeconds: number;
  lowBalance: bigint;
};

export const defaultGuardianThresholds: GuardianThresholds = {
  budgetFractionBps: 8000,
  paymentsInWindow: 5,
  windowSeconds: 15 * 60,
  relayFailures: 3,
  expiryWarningSeconds: 24 * 60 * 60,
  lowBalance: 1_000_000n,
};

/**
 * Deterministic rules over facts the caller already read. A match is a signal, not proof of fraud.
 * The same rule and subject inside one window produces one alert.
 */
export function evaluateGuardian(
  facts: GuardianFact[],
  now: number,
  thresholds: GuardianThresholds = defaultGuardianThresholds,
): GuardianAlert[] {
  const alerts: GuardianAlert[] = [];
  const seen = new Set<string>();

  function push(alert: GuardianAlert) {
    const key = `${alert.rule}:${alert.subject}:${Math.floor(alert.at / thresholds.windowSeconds)}`;
    if (seen.has(key)) return;
    seen.add(key);
    alerts.push(alert);
  }

  const payments = facts.filter((fact) => fact.kind === "payment" || fact.kind === "session_settled");
  const bySubject = new Map<string, GuardianFact[]>();
  for (const fact of payments) {
    const list = bySubject.get(fact.subject) ?? [];
    list.push(fact);
    bySubject.set(fact.subject, list);
  }
  for (const [subject, rows] of bySubject) {
    const recent = rows.filter((fact) => now - fact.at <= thresholds.windowSeconds);
    if (recent.length >= thresholds.paymentsInWindow) {
      push({
        id: `velocity:${subject}:${now}`,
        rule: "payment_velocity",
        severity: "watch",
        at: now,
        subject,
        explanation: `${recent.length} payments were indexed in the last ${thresholds.windowSeconds} seconds.`,
        evidence: recent.map((fact) => fact.id).join(","),
        suggestion: "Review the agent and pause spending if the burst was not expected.",
      });
    }
  }

  for (const fact of facts) {
    if (fact.kind === "near_limit" && fact.amount !== undefined && fact.limit !== undefined && fact.limit > 0n) {
      const used = (fact.amount * 10_000n) / fact.limit;
      if (used >= BigInt(thresholds.budgetFractionBps)) {
        push({
          id: `limit:${fact.subject}:${fact.id}`,
          rule: "near_budget",
          severity: used >= 9_500n ? "urgent" : "watch",
          at: fact.at,
          subject: fact.subject,
          explanation: `Indexed spending is ${used.toString()} bps of the configured limit.`,
          evidence: fact.id,
          suggestion: "Lower the agent cap, revoke the agent, or pause the workspace.",
        });
      }
    }
    if (fact.kind === "expiring" && fact.detail) {
      const expiresAt = Number(fact.detail);
      if (Number.isFinite(expiresAt) && expiresAt > now && expiresAt - now <= thresholds.expiryWarningSeconds) {
        push({
          id: `expiry:${fact.subject}:${fact.id}`,
          rule: "authorization_expiring",
          severity: "info",
          at: fact.at,
          subject: fact.subject,
          explanation: "An agent authorization or session deadline is inside the warning window.",
          evidence: fact.id,
          suggestion: "Renew the authorization only if the agent should keep spending.",
        });
      }
    }
    if (fact.kind === "revoked") {
      push({
        id: `revoked:${fact.subject}:${fact.id}`,
        rule: "agent_revoked",
        severity: "info",
        at: fact.at,
        subject: fact.subject,
        explanation: "The contract recorded an agent revocation.",
        evidence: fact.id,
        suggestion: "Confirm later payment attempts from that agent revert.",
      });
    }
    if (fact.kind === "low_balance" && fact.amount !== undefined && fact.amount <= thresholds.lowBalance) {
      push({
        id: `balance:${fact.subject}:${fact.id}`,
        rule: "low_available_balance",
        severity: "watch",
        at: fact.at,
        subject: fact.subject,
        explanation: "Available USDC is at or below the configured floor.",
        evidence: fact.id,
        suggestion: "Deposit more USDC or close sessions that still reserve funds.",
      });
    }
  }

  const failures = facts.filter((fact) => fact.kind === "relay_failure" && now - fact.at <= thresholds.windowSeconds);
  const failuresBySubject = new Map<string, GuardianFact[]>();
  for (const fact of failures) {
    const list = failuresBySubject.get(fact.subject) ?? [];
    list.push(fact);
    failuresBySubject.set(fact.subject, list);
  }
  for (const [subject, rows] of failuresBySubject) {
    if (rows.length >= thresholds.relayFailures) {
      push({
        id: `relay:${subject}:${now}`,
        rule: "relay_failures",
        severity: "watch",
        at: now,
        subject,
        explanation: `${rows.length} relay requests failed validation in the current window.`,
        evidence: rows.map((fact) => fact.id).join(","),
        suggestion: "These rows are relay records, not reverted chain logs. Check the agent and the quote.",
      });
    }
  }

  return alerts;
}
