"use client";

import { getDb, getMeta, setMeta } from "@/lib/db/dexie";
import type { Entity } from "@/lib/db/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const CURSOR_KEY = "sync_cursor";
const BATCH = 200;

export type SyncState = {
  status: "idle" | "syncing" | "offline" | "error";
  pending: number;
  lastSyncedAt: string | null;
  message?: string;
  rejected: number;
};

type Listener = (state: SyncState) => void;

let state: SyncState = { status: "idle", pending: 0, lastSyncedAt: null, rejected: 0 };
const listeners = new Set<Listener>();
let running = false;
let queuedAgain = false;

export function subscribeSync(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

function emit(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

const TABLE: Record<Entity, "accounts" | "categories" | "transactions" | "budgets" | "recurring"> = {
  accounts: "accounts",
  categories: "categories",
  transactions: "transactions",
  budgets: "budgets",
  recurring: "recurring",
};

/** Dexie mengetikkan tiap tabel berbeda, jadi akses generik butuh satu titik pelonggaran. */
function table(db: ReturnType<typeof getDb>, entity: Entity) {
  return db[TABLE[entity]] as unknown as import("dexie").Table<Record<string, unknown>, string>;
}

async function countPending(): Promise<number> {
  return getDb().outbox.count();
}

/** Menjalankan sync. Aman dipanggil berkali-kali, hanya satu yang jalan. */
export async function requestSync(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isSupabaseConfigured) return;
  if (running) {
    queuedAgain = true;
    return;
  }
  if (!navigator.onLine) {
    emit({ status: "offline", pending: await countPending() });
    return;
  }

  running = true;
  emit({ status: "syncing" });
  try {
    await push();
    await pull();
    emit({
      status: "idle",
      pending: await countPending(),
      lastSyncedAt: new Date().toISOString(),
      message: undefined,
    });
  } catch (err) {
    const offline = !navigator.onLine;
    emit({
      status: offline ? "offline" : "error",
      pending: await countPending(),
      message: err instanceof Error ? err.message : "Sync gagal",
    });
  } finally {
    running = false;
    if (queuedAgain) {
      queuedAgain = false;
      void requestSync();
    }
  }
}

async function push(): Promise<void> {
  const db = getDb();
  for (;;) {
    const rows = await db.outbox.orderBy("seq").limit(BATCH).toArray();
    if (rows.length === 0) return;

    const res = await fetch("/api/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `${rows[0].seq}-${rows[rows.length - 1].seq}`,
      },
      body: JSON.stringify({
        changes: rows.map((r) => ({
          entity: r.entity,
          op: r.op,
          id: r.entity_id,
          payload: r.payload,
          base_updated_at: r.base_updated_at,
        })),
      }),
    });

    if (res.status === 401) throw new Error("Sesi berakhir, silakan masuk lagi");
    if (!res.ok) throw new Error(`Gagal mengirim perubahan (${res.status})`);

    const body = (await res.json()) as {
      applied: Array<{ entity: Entity; row: Record<string, unknown> }>;
      rejected: Array<{ id: string; reason: string }>;
      overwritten: number;
    };

    // Hanya baris yang benar-benar diterima server boleh lepas dari outbox.
    // Baris yang ditolak (mis. gagal validasi) harus tetap tersimpan supaya
    // kelihatan sebagai gagal, bukan hilang diam-diam dianggap sudah sinkron.
    const rejectedIds = new Set(body.rejected.map((r) => r.id));
    const doneSeqs = rows
      .filter((r) => !rejectedIds.has(r.entity_id))
      .map((r) => r.seq!)
      .filter(Boolean);

    await db.transaction("rw", db.tables, async () => {
      for (const { entity, row } of body.applied) {
        await table(db, entity).put(row);
      }
      await db.outbox.bulkDelete(doneSeqs);
    });

    if (body.overwritten > 0) {
      emit({ message: `${body.overwritten} perubahan ditimpa versi terbaru` });
    }
    if (body.rejected.length > 0) {
      emit({
        rejected: body.rejected.length,
        message: `${body.rejected.length} perubahan ditolak server: ${body.rejected[0].reason}`,
      });
    }
    emit({ pending: await countPending() });
    if (rejectedIds.size > 0) return; // hindari retry loop tak berkesudahan pada baris yang sama
    if (rows.length < BATCH) return;
  }
}

async function pull(): Promise<void> {
  const db = getDb();
  let since = await getMeta<string | null>(CURSOR_KEY, null);

  for (;;) {
    const url = since ? `/api/sync?since=${encodeURIComponent(since)}` : "/api/sync";
    const res = await fetch(url);
    if (res.status === 401) throw new Error("Sesi berakhir, silakan masuk lagi");
    if (!res.ok) throw new Error(`Gagal menarik perubahan (${res.status})`);

    const body = (await res.json()) as {
      changes: Partial<Record<Entity, Record<string, unknown>[]>>;
      cursor: string | null;
      has_more: boolean;
    };

    const entries = Object.entries(body.changes) as Array<[Entity, Record<string, unknown>[]]>;
    const total = entries.reduce((n, [, rows]) => n + rows.length, 0);

    if (total > 0) {
      // Baris yang masih menunggu dikirim tidak boleh ditimpa hasil tarikan.
      const pendingIds = new Set((await db.outbox.toArray()).map((r) => r.entity_id));
      await db.transaction("rw", db.tables, async () => {
        for (const [entity, rows] of entries) {
          const keep = rows.filter((r) => !pendingIds.has(r.id as string));
          if (keep.length) await table(db, entity).bulkPut(keep);
        }
      });
    }

    if (body.cursor) {
      since = body.cursor;
      await setMeta(CURSOR_KEY, body.cursor);
    }
    if (!body.has_more) return;
  }
}

/** Dipasang sekali oleh SyncProvider. */
export function startSyncLoop(): () => void {
  if (!isSupabaseConfigured) {
    emit({ status: "idle", message: "Mode lokal, data hanya di perangkat ini" });
    return () => {};
  }

  const onOnline = () => void requestSync();
  const onVisible = () => {
    if (document.visibilityState === "visible") void requestSync();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", () => emit({ status: "offline" }));
  document.addEventListener("visibilitychange", onVisible);
  const timer = window.setInterval(() => void requestSync(), 60_000);
  void requestSync();

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
  };
}
