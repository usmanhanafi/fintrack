"use client";

import { v7 as uuidv7 } from "uuid";
import { getDb } from "./dexie";
import type { Entity, Synced } from "./types";
import { requestSync } from "@/lib/sync/engine";

export function newId(): string {
  return uuidv7();
}

const TABLE: Record<Entity, "accounts" | "categories" | "transactions" | "budgets" | "recurring"> = {
  accounts: "accounts",
  categories: "categories",
  transactions: "transactions",
  budgets: "budgets",
  recurring: "recurring",
};

/**
 * Tulis satu baris ke IndexedDB dan antrekan ke outbox dalam satu transaksi database.
 * UI membaca hasilnya seketika. Jaringan diurus belakangan oleh mesin sync.
 */
export async function putLocal<T extends Synced & { id: string }>(
  entity: Entity,
  row: Omit<T, keyof Synced | "id"> & Partial<Synced> & { id?: string },
): Promise<string> {
  const db = getDb();
  const table = db[TABLE[entity]] as unknown as import("dexie").Table<T, string>;
  const now = new Date().toISOString();
  const id = row.id ?? newId();

  await db.transaction("rw", table, db.outbox, async () => {
    const existing = await table.get(id);
    const next = {
      ...(existing ?? {}),
      ...row,
      id,
      created_at: existing?.created_at ?? row.created_at ?? now,
      updated_at: now,
      deleted_at: existing?.deleted_at ?? null,
    } as T;
    await table.put(next);
    await db.outbox.add({
      entity,
      entity_id: id,
      op: "upsert",
      payload: next as unknown as Record<string, unknown>,
      base_updated_at: existing?.updated_at ?? null,
      created_at: now,
    });
  });

  void requestSync();
  return id;
}

/** Soft delete. Hard delete membuat baris hidup lagi setelah sync. */
export async function removeLocal(entity: Entity, id: string): Promise<void> {
  const db = getDb();
  const table = db[TABLE[entity]] as unknown as import("dexie").Table<Synced & { id: string }, string>;
  const now = new Date().toISOString();

  await db.transaction("rw", table, db.outbox, async () => {
    const existing = await table.get(id);
    if (!existing) return;
    const next = { ...existing, deleted_at: now, updated_at: now };
    await table.put(next);
    await db.outbox.add({
      entity,
      entity_id: id,
      op: "delete",
      payload: next as unknown as Record<string, unknown>,
      base_updated_at: existing.updated_at,
      created_at: now,
    });
  });

  void requestSync();
}

/** Menulis banyak baris sekaligus, dipakai impor CSV dan seed. Tetap atomik. */
export async function bulkPutLocal(
  items: Array<{ entity: Entity; row: Record<string, unknown> & { id?: string } }>,
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.transaction("rw", db.tables, async () => {
    for (const { entity, row } of items) {
      const table = db[TABLE[entity]] as unknown as import("dexie").Table<Record<string, unknown>, string>;
      const id = (row.id as string) ?? newId();
      const next = { ...row, id, created_at: row.created_at ?? now, updated_at: now, deleted_at: null };
      await table.put(next);
      await db.outbox.add({
        entity,
        entity_id: id,
        op: "upsert",
        payload: next,
        base_updated_at: null,
        created_at: now,
      });
    }
  });
  void requestSync();
}
