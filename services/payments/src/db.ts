import fs from "node:fs";
import path from "node:path";

import { DatabaseSync } from "node:sqlite";

export type QuoteRow = {
  id: string;
  record_key: string;
  vault: string;
  recipient: string;
  token: string;
  amount: string;
  payment_id: string;
  expires_at: number;
  chain_id: number;
  created_at: number;
};

export type RelayStatus =
  | "received"
  | "simulated"
  | "submitting"
  | "submitted"
  | "confirmed"
  | "reverted"
  | "simulation_reverted"
  | "failed";

export type RelayRow = {
  digest: string;
  quote_id: string;
  intent_json: string;
  signature: string;
  chain_id: number;
  status: RelayStatus;
  tx_hash: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
};

export type DeliveryRow = {
  quote_id: string;
  tx_hash: string;
  payload_json: string;
  delivered_at: number;
};

export class PaymentsDb {
  readonly connection: DatabaseSync;

  constructor(file: string) {
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
    this.connection = new DatabaseSync(file);
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS quotes (
        id TEXT PRIMARY KEY,
        record_key TEXT NOT NULL,
        vault TEXT NOT NULL,
        recipient TEXT NOT NULL,
        token TEXT NOT NULL,
        amount TEXT NOT NULL,
        payment_id TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        chain_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS relay_requests (
        digest TEXT PRIMARY KEY,
        quote_id TEXT NOT NULL,
        intent_json TEXT NOT NULL,
        signature TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        tx_hash TEXT,
        error_code TEXT,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS deliveries (
        quote_id TEXT PRIMARY KEY,
        tx_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        delivered_at INTEGER NOT NULL
      );
    `);
  }

  insertQuote(row: QuoteRow): void {
    this.connection
      .prepare(
        `INSERT INTO quotes
          (id, record_key, vault, recipient, token, amount, payment_id, expires_at, chain_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.record_key,
        row.vault,
        row.recipient,
        row.token,
        row.amount,
        row.payment_id,
        row.expires_at,
        row.chain_id,
        row.created_at,
      );
  }

  getQuote(id: string): QuoteRow | undefined {
    return this.connection.prepare("SELECT * FROM quotes WHERE id = ?").get(id) as QuoteRow | undefined;
  }

  expireQuote(id: string, expiresAt: number): void {
    this.connection.prepare("UPDATE quotes SET expires_at = ? WHERE id = ?").run(expiresAt, id);
  }

  claimRelay(row: RelayRow): { row: RelayRow; owner: boolean } {
    try {
      this.connection
        .prepare(
          `INSERT INTO relay_requests
            (digest, quote_id, intent_json, signature, chain_id, status, tx_hash, error_code, error_message, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.digest,
          row.quote_id,
          row.intent_json,
          row.signature,
          row.chain_id,
          row.status,
          row.tx_hash,
          row.error_code,
          row.error_message,
          row.created_at,
          row.updated_at,
        );
      return { row, owner: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/UNIQUE/i.test(message)) throw error;
      const existing = this.getRelay(row.digest);
      if (!existing) throw error;
      return { row: existing, owner: false };
    }
  }

  getRelay(digest: string): RelayRow | undefined {
    return this.connection.prepare("SELECT * FROM relay_requests WHERE digest = ?").get(digest) as RelayRow | undefined;
  }

  updateRelay(digest: string, patch: Partial<Pick<RelayRow, "status" | "tx_hash" | "error_code" | "error_message">>): RelayRow {
    const current = this.getRelay(digest);
    if (!current) throw new Error(`Missing relay row ${digest}`);
    const next: RelayRow = {
      ...current,
      ...patch,
      updated_at: Math.floor(Date.now() / 1000),
    };
    this.connection
      .prepare(
        `UPDATE relay_requests
         SET status = ?, tx_hash = ?, error_code = ?, error_message = ?, updated_at = ?
         WHERE digest = ?`,
      )
      .run(next.status, next.tx_hash, next.error_code, next.error_message, next.updated_at, digest);
    return next;
  }

  saveDelivery(row: DeliveryRow): void {
    this.connection
      .prepare(
        `INSERT INTO deliveries (quote_id, tx_hash, payload_json, delivered_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(quote_id) DO UPDATE SET
           tx_hash = excluded.tx_hash,
           payload_json = excluded.payload_json,
           delivered_at = excluded.delivered_at`,
      )
      .run(row.quote_id, row.tx_hash, row.payload_json, row.delivered_at);
  }

  close(): void {
    this.connection.close();
  }
}
