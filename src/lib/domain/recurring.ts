"use client";

import { getDb } from "@/lib/db/dexie";
import { putLocal } from "@/lib/db/mutate";
import { addDays, daysInMonth, localDay } from "@/lib/time";
import type { RecurringRule, Transaction } from "@/lib/db/types";

/** Tanggal kejadian berikutnya setelah `after`, atau null jika jadwal sudah habis. */
export function nextOccurrence(rule: RecurringRule, after: string | null): string | null {
  const start = rule.start_on;
  let candidate = after ? advance(rule, after) : start;
  if (!after && rule.frequency === "monthly" && rule.day_of_month) {
    candidate = clampToMonth(start.slice(0, 7), rule.day_of_month);
    if (candidate < start) candidate = advance(rule, candidate);
  }
  if (candidate < start) candidate = start;
  if (rule.end_on && candidate > rule.end_on) return null;
  return candidate;
}

function advance(rule: RecurringRule, from: string): string {
  const n = Math.max(1, rule.interval_n);
  switch (rule.frequency) {
    case "daily":
      return addDays(from, n);
    case "weekly":
      return addDays(from, 7 * n);
    case "custom":
      return addDays(from, n);
    case "monthly": {
      const [y, m] = from.split("-").map(Number);
      const total = y * 12 + (m - 1) + n;
      const month = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
      return clampToMonth(month, rule.day_of_month ?? Number(from.slice(8, 10)));
    }
    case "yearly": {
      const [y, rest] = [Number(from.slice(0, 4)), from.slice(5)];
      return `${y + n}-${rest}`;
    }
  }
}

/** Tanggal 31 di bulan yang hanya punya 30 hari jatuh ke hari terakhir bulan itu. */
function clampToMonth(month: string, day: number): string {
  const last = daysInMonth(`${month}-01`);
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export interface RunResult {
  created: number;
  pending: Array<{ rule: RecurringRule; date: string }>;
}

const MAX_PER_RULE = 60;

/**
 * Membuat transaksi untuk semua jadwal yang sudah jatuh tempo sampai hari ini.
 * Idempoten: kejadian yang sudah punya transaksi dilewati, jadi membuka aplikasi
 * berkali-kali dalam satu hari tidak menggandakan apa pun.
 */
let inFlight: Promise<RunResult> | null = null;

export function runRecurring(today = localDay()): Promise<RunResult> {
  // Sama seperti seed: mode ketat memanggil dua kali, dan pemeriksaan "sudah ada"
  // di sini adalah baca lalu tulis, jadi dua jalur bersamaan bisa sama-sama lolos.
  inFlight ??= execute(today).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function execute(today: string): Promise<RunResult> {
  const db = getDb();
  const rules = (await db.recurring.toArray()).filter((r) => !r.deleted_at);
  const result: RunResult = { created: 0, pending: [] };

  for (const rule of rules) {
    let cursor: string | null = rule.last_run_on ?? null;
    let guard = 0;

    for (;;) {
      const date: string | null = nextOccurrence(rule, cursor);
      if (!date || date > today || guard++ >= MAX_PER_RULE) break;
      cursor = date;

      const already = await db.transactions
        .where("recurring_id")
        .equals(rule.id)
        .filter((t) => t.occurred_on === date && !t.deleted_at)
        .first();

      if (already) continue;

      if (rule.mode === "reminder") {
        result.pending.push({ rule, date });
        continue;
      }

      await putLocal<Transaction>("transactions", {
        ...rule.template,
        to_account_id: rule.template.to_account_id ?? null,
        category_id: rule.template.category_id ?? null,
        note: rule.template.note ?? rule.name,
        merchant: null,
        tags: [],
        occurred_at: new Date(`${date}T09:00:00+07:00`).toISOString(),
        occurred_on: date,
        recurring_id: rule.id,
        source: "recurring",
      });
      result.created += 1;
    }

    if (cursor && cursor !== rule.last_run_on && rule.mode === "auto") {
      await putLocal<RecurringRule>("recurring", { ...rule, last_run_on: cursor });
    }
  }

  return result;
}
