"use client";

import { getDb } from "@/lib/db/dexie";
import { bulkPutLocal, newId } from "@/lib/db/mutate";
import { listAccounts, listCategories, transactionsInRange } from "@/lib/db/queries";
import { parseMoney } from "@/lib/money";
import { localDay } from "@/lib/time";
import type { Transaction, TxType } from "@/lib/db/types";

export const CSV_COLUMNS = [
  "id",
  "tanggal",
  "waktu",
  "tipe",
  "jumlah",
  "akun",
  "akun_tujuan",
  "kategori",
  "catatan",
  "tag",
  "sumber",
] as const;

function escapeCell(value: string): string {
  return /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** BOM dipertahankan supaya Excel di Windows tidak merusak huruf beraksen. */
export async function exportCsv(from: string, to: string): Promise<string> {
  const [rows, accounts, categories] = await Promise.all([
    transactionsInRange(from, to),
    listAccounts(true),
    listCategories(true),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const lines = [CSV_COLUMNS.join(",")];
  for (const tx of rows) {
    lines.push(
      [
        tx.id,
        tx.occurred_on,
        tx.occurred_at.slice(11, 16),
        tx.type,
        String(tx.amount_minor),
        accountName.get(tx.account_id) ?? "",
        tx.to_account_id ? (accountName.get(tx.to_account_id) ?? "") : "",
        tx.category_id ? (categoryName.get(tx.category_id) ?? "") : "",
        tx.note ?? "",
        tx.tags.join(" "),
        tx.source,
      ]
        .map((cell) => escapeCell(String(cell)))
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}`;
}

export async function exportJson(): Promise<string> {
  const db = getDb();
  const [accounts, categories, transactions, budgets, recurring] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
    db.budgets.toArray(),
    db.recurring.toArray(),
  ]);
  return JSON.stringify(
    { version: 1, exported_at: new Date().toISOString(), accounts, categories, transactions, budgets, recurring },
    null,
    2,
  );
}

export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------------ impor

export interface ParsedRow {
  raw: string[];
  tx: Omit<Transaction, "created_at" | "updated_at"> | null;
  problem?: string;
  duplicate?: boolean;
}

export interface ImportPreview {
  header: string[];
  rows: ParsedRow[];
  newCount: number;
  duplicateCount: number;
  failedCount: number;
  batchId: string;
}

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

/**
 * Membaca CSV dan memetakan kolom berdasarkan nama header. Berkas hasil ekspor
 * aplikasi ini bisa langsung dibaca kembali tanpa pemetaan manual.
 */
export async function previewImport(text: string): Promise<ImportPreview> {
  const clean = text.replace(/^\uFEFF/, "").trim();
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { header: [], rows: [], newCount: 0, duplicateCount: 0, failedCount: 0, batchId: newId() };
  }

  const delimiter = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitLine(lines[0], delimiter).map((h) => h.toLowerCase());
  const index = (...names: string[]) => {
    for (const name of names) {
      const at = header.indexOf(name);
      if (at >= 0) return at;
    }
    return -1;
  };

  const col = {
    id: index("id"),
    date: index("tanggal", "date", "tgl"),
    time: index("waktu", "time"),
    type: index("tipe", "type"),
    amount: index("jumlah", "amount", "nominal"),
    account: index("akun", "account", "dompet"),
    toAccount: index("akun_tujuan", "to_account"),
    category: index("kategori", "category"),
    note: index("catatan", "note", "keterangan", "deskripsi"),
    tags: index("tag", "tags"),
  };

  const db = getDb();
  const [accounts, categories, existing] = await Promise.all([
    listAccounts(true),
    listCategories(true),
    db.transactions.toArray(),
  ]);

  const accountByName = new Map(accounts.map((a) => [a.name.toLowerCase(), a]));
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const existingIds = new Set(existing.map((t) => t.id));
  const fingerprints = new Set(
    existing.filter((t) => !t.deleted_at).map((t) => fingerprint(t.occurred_on, t.amount_minor, t.account_id, t.note ?? "")),
  );

  const rows: ParsedRow[] = [];
  let newCount = 0;
  let duplicateCount = 0;
  let failedCount = 0;

  for (const line of lines.slice(1)) {
    const cells = splitLine(line, delimiter);
    const at = (i: number) => (i >= 0 ? (cells[i] ?? "") : "");

    const amount = parseMoney(at(col.amount));
    const day = normalizeDate(at(col.date));
    const account = accountByName.get(at(col.account).toLowerCase()) ?? accounts[0];

    if (amount === null || amount <= 0) {
      rows.push({ raw: cells, tx: null, problem: "Jumlah tidak terbaca" });
      failedCount++;
      continue;
    }
    if (!day) {
      rows.push({ raw: cells, tx: null, problem: "Tanggal tidak terbaca" });
      failedCount++;
      continue;
    }
    if (!account) {
      rows.push({ raw: cells, tx: null, problem: "Akun tidak dikenal" });
      failedCount++;
      continue;
    }

    const rawType = at(col.type).toLowerCase();
    const type: TxType =
      rawType.startsWith("in") || rawType.startsWith("mas")
        ? "income"
        : rawType.startsWith("tr")
          ? "transfer"
          : "expense";

    const category = categoryByName.get(at(col.category).toLowerCase());
    if (type !== "transfer" && !category) {
      rows.push({ raw: cells, tx: null, problem: `Kategori "${at(col.category)}" belum ada` });
      failedCount++;
      continue;
    }

    const toAccount = accountByName.get(at(col.toAccount).toLowerCase());
    if (type === "transfer" && !toAccount) {
      rows.push({ raw: cells, tx: null, problem: "Akun tujuan tidak dikenal" });
      failedCount++;
      continue;
    }

    const note = at(col.note) || null;
    const id = at(col.id);
    const isDuplicate = id
      ? existingIds.has(id)
      : fingerprints.has(fingerprint(day, amount, account.id, note ?? ""));

    const time = at(col.time) || "09:00";
    rows.push({
      raw: cells,
      duplicate: isDuplicate,
      tx: {
        id: id || newId(),
        type,
        amount_minor: amount,
        account_id: account.id,
        to_account_id: type === "transfer" ? (toAccount?.id ?? null) : null,
        category_id: type === "transfer" ? null : (category?.id ?? null),
        note,
        merchant: null,
        tags: at(col.tags) ? at(col.tags).split(/\s+/) : [],
        occurred_at: new Date(`${day}T${time.padStart(5, "0")}:00+07:00`).toISOString(),
        occurred_on: day,
        recurring_id: null,
        source: "import",
        external_ref: null,
        import_batch_id: null,
        deleted_at: null,
      },
    });

    if (isDuplicate) duplicateCount++;
    else newCount++;
  }

  return { header, rows, newCount, duplicateCount, failedCount, batchId: newId() };
}

function fingerprint(day: string, amount: number, accountId: string, note: string): string {
  return `${day}|${amount}|${accountId}|${note.trim().toLowerCase()}`;
}

function normalizeDate(input: string): string | null {
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : localDay(parsed);
}

/** Menyimpan hasil impor. Semua baris masuk sekaligus, dan bisa diurungkan per batch. */
export async function commitImport(
  preview: ImportPreview,
  options: { includeDuplicates: boolean },
): Promise<number> {
  const rows = preview.rows.filter(
    (r) => r.tx && (options.includeDuplicates || !r.duplicate),
  );
  if (rows.length === 0) return 0;

  await bulkPutLocal(
    rows.map((r) => ({
      entity: "transactions" as const,
      row: { ...(r.tx as object), import_batch_id: preview.batchId } as Record<string, unknown>,
    })),
  );
  return rows.length;
}
