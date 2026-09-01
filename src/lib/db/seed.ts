"use client";

import { getDb, setMeta } from "./dexie";
import { newId } from "./mutate";
import { requestSync } from "@/lib/sync/engine";
import type { AccountType, CategoryKind } from "./types";

const ACCOUNTS: Array<{ name: string; type: AccountType; color: string }> = [
  { name: "Tunai", type: "cash", color: "#16a34a" },
  { name: "Bank", type: "bank", color: "#2563eb" },
  { name: "E-Wallet", type: "ewallet", color: "#9333ea" },
];

const CATEGORIES: Array<{ name: string; kind: CategoryKind; icon: string; color: string }> = [
  { name: "Makan dan Minum", kind: "expense", icon: "utensils", color: "#f97316" },
  { name: "Transportasi", kind: "expense", icon: "car", color: "#0ea5e9" },
  { name: "Belanja", kind: "expense", icon: "shopping-bag", color: "#ec4899" },
  { name: "Tagihan dan Utilitas", kind: "expense", icon: "receipt", color: "#64748b" },
  { name: "Kesehatan", kind: "expense", icon: "heart-pulse", color: "#ef4444" },
  { name: "Pendidikan", kind: "expense", icon: "graduation-cap", color: "#8b5cf6" },
  { name: "Hiburan", kind: "expense", icon: "clapperboard", color: "#14b8a6" },
  { name: "Keluarga", kind: "expense", icon: "users", color: "#f59e0b" },
  { name: "Donasi dan Zakat", kind: "expense", icon: "hand-heart", color: "#22c55e" },
  { name: "Lainnya", kind: "expense", icon: "circle-dashed", color: "#94a3b8" },
  { name: "Gaji", kind: "income", icon: "wallet", color: "#16a34a" },
  { name: "Bonus", kind: "income", icon: "gift", color: "#eab308" },
  { name: "Freelance", kind: "income", icon: "briefcase", color: "#3b82f6" },
  { name: "Hadiah", kind: "income", icon: "party-popper", color: "#d946ef" },
  { name: "Pemasukan Lain", kind: "income", icon: "circle-plus", color: "#94a3b8" },
];

// Effect React dipanggil dua kali di mode ketat, dan dua tab bisa memuat aplikasi
// bersamaan. Tanpa penjagaan ini kategori bawaan tercipta berganda.
let inFlight: Promise<void> | null = null;

export function seedIfEmpty(): Promise<void> {
  inFlight ??= run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  let seeded = false;

  // Tarik dulu data server sebelum menilai "kosong". Tanpa ini, perangkat baru yang
  // belum pernah pull bisa mengira akun belum ada padahal server sudah punya (dibuat
  // dari perangkat lain), lalu ikut membuat akun bawaan lagi jadi berganda.
  await requestSync();

  // Pemeriksaan dan penulisan berada di satu transaksi database, jadi dua pemanggilan
  // bersamaan tidak bisa sama-sama lolos pemeriksaan kosong.
  await db.transaction("rw", db.accounts, db.categories, db.outbox, db.meta, async () => {
    const flag = await db.meta.get("seeded");
    if (flag?.value) return;

    const [accountCount, categoryCount] = await Promise.all([
      db.accounts.count(),
      db.categories.count(),
    ]);
    if (accountCount > 0 || categoryCount > 0) {
      await db.meta.put({ key: "seeded", value: true });
      return;
    }

    for (const [i, account] of ACCOUNTS.entries()) {
      const row = {
        ...account,
        id: newId(),
        opening_balance_minor: 0,
        icon: null,
        sort_order: i,
        archived_at: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      await db.accounts.add(row);
      await db.outbox.add({
        entity: "accounts",
        entity_id: row.id,
        op: "upsert",
        payload: row,
        base_updated_at: null,
        created_at: now,
      });
    }

    for (const [i, category] of CATEGORIES.entries()) {
      const row = {
        ...category,
        id: newId(),
        parent_id: null,
        sort_order: i,
        archived_at: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      await db.categories.add(row);
      await db.outbox.add({
        entity: "categories",
        entity_id: row.id,
        op: "upsert",
        payload: row,
        base_updated_at: null,
        created_at: now,
      });
    }

    await db.meta.put({ key: "seeded", value: true });
    seeded = true;
  });

  if (seeded) {
    void setMeta("seeded", true);
    void requestSync();
  }
}
