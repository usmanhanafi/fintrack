"use client";

import Dexie, { type Table } from "dexie";
import type {
  Account, Budget, Category, MetaRow, OutboxRow, RecurringRule, Transaction,
} from "./types";

export class FinTrackDB extends Dexie {
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  budgets!: Table<Budget, string>;
  recurring!: Table<RecurringRule, string>;
  outbox!: Table<OutboxRow, number>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("fintrack");
    this.version(1).stores({
      accounts: "id, sort_order, updated_at, deleted_at",
      categories: "id, kind, parent_id, sort_order, updated_at, deleted_at",
      transactions:
        "id, occurred_on, account_id, to_account_id, category_id, type, updated_at, deleted_at, recurring_id, [type+occurred_on], [category_id+occurred_on]",
      budgets: "id, period_month, category_id, updated_at, deleted_at, [category_id+period_month]",
      recurring: "id, start_on, updated_at, deleted_at",
      outbox: "++seq, entity, entity_id, created_at",
      meta: "key",
    });
  }
}

let instance: FinTrackDB | null = null;

export function getDb(): FinTrackDB {
  if (!instance) instance = new FinTrackDB();
  return instance;
}

export const db = typeof window === "undefined" ? (null as unknown as FinTrackDB) : getDb();

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await getDb().meta.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await getDb().meta.put({ key, value });
}

/** Dipanggil saat logout atau saat user berganti. */
export async function resetLocalData(): Promise<void> {
  const d = getDb();
  await d.transaction("rw", d.tables, async () => {
    await Promise.all(d.tables.map((t) => t.clear()));
  });
}
