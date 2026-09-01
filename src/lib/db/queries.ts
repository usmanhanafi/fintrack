"use client";

import { getDb } from "./dexie";
import { signedFor } from "@/lib/money";
import { addMonths, monthRange } from "@/lib/time";
import type { Account, Budget, Category, Transaction } from "./types";

const alive = <T extends { deleted_at?: string | null }>(rows: T[]) =>
  rows.filter((r) => !r.deleted_at);

export async function listAccounts(includeArchived = false): Promise<Account[]> {
  const rows = alive(await getDb().accounts.toArray());
  return rows
    .filter((a) => includeArchived || !a.archived_at)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export async function listCategories(includeArchived = false): Promise<Category[]> {
  const rows = alive(await getDb().categories.toArray());
  return rows
    .filter((c) => includeArchived || !c.archived_at)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export async function transactionsInRange(from: string, to: string): Promise<Transaction[]> {
  const rows = await getDb()
    .transactions.where("occurred_on")
    .between(from, to, true, true)
    .toArray();
  return alive(rows).sort(
    (a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.created_at.localeCompare(a.created_at),
  );
}

/** Saldo dihitung dari mutasi, tidak pernah disimpan. */
export async function accountBalances(): Promise<Map<string, number>> {
  const db = getDb();
  const [accounts, txs] = await Promise.all([
    listAccounts(true),
    db.transactions.toArray(),
  ]);

  const balances = new Map<string, number>();
  for (const account of accounts) balances.set(account.id, account.opening_balance_minor);

  for (const tx of alive(txs)) {
    for (const id of [tx.account_id, tx.to_account_id]) {
      if (!id || !balances.has(id)) continue;
      const delta = signedFor(tx, id);
      if (delta !== 0) balances.set(id, balances.get(id)! + delta);
    }
  }
  return balances;
}

export interface PeriodSummary {
  income: number;
  expense: number;
  net: number;
  count: number;
}

export async function summarize(from: string, to: string): Promise<PeriodSummary> {
  const txs = await transactionsInRange(from, to);
  let income = 0;
  let expense = 0;
  for (const tx of txs) {
    if (tx.type === "income") income += tx.amount_minor;
    else if (tx.type === "expense") expense += tx.amount_minor;
  }
  return { income, expense, net: income - expense, count: txs.length };
}

export interface CategoryTotal {
  category_id: string;
  name: string;
  color: string;
  total: number;
  count: number;
  share: number;
}

export async function categoryTotals(
  from: string,
  to: string,
  kind: "expense" | "income" = "expense",
): Promise<CategoryTotal[]> {
  const [txs, categories] = await Promise.all([transactionsInRange(from, to), listCategories(true)]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, { total: number; count: number }>();

  for (const tx of txs) {
    if (tx.type !== kind || !tx.category_id) continue;
    const current = totals.get(tx.category_id) ?? { total: 0, count: 0 };
    current.total += tx.amount_minor;
    current.count += 1;
    totals.set(tx.category_id, current);
  }

  const grand = [...totals.values()].reduce((n, v) => n + v.total, 0);
  return [...totals.entries()]
    .map(([id, v]) => ({
      category_id: id,
      name: byId.get(id)?.name ?? "Tanpa kategori",
      color: byId.get(id)?.color ?? "#94a3b8",
      total: v.total,
      count: v.count,
      share: grand > 0 ? v.total / grand : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export async function dailyTotals(
  from: string,
  to: string,
): Promise<Array<{ day: string; expense: number; income: number }>> {
  const txs = await transactionsInRange(from, to);
  const map = new Map<string, { expense: number; income: number }>();
  for (const tx of txs) {
    if (tx.type === "transfer") continue;
    const bucket = map.get(tx.occurred_on) ?? { expense: 0, income: 0 };
    if (tx.type === "expense") bucket.expense += tx.amount_minor;
    else bucket.income += tx.amount_minor;
    map.set(tx.occurred_on, bucket);
  }
  return [...map.entries()]
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export interface BudgetStatus {
  budget: Budget;
  category: Category | undefined;
  limit: number;
  used: number;
  remaining: number;
  ratio: number;
  carry: number;
}

const MAX_ROLLOVER_LOOKBACK = 12;

/**
 * Sisa budget bulan sebelumnya ikut terbawa saat rollover aktif.
 * Penelusuran dibatasi 12 bulan supaya tidak menjadi rekursi tanpa ujung.
 */
export async function budgetStatuses(periodMonth: string): Promise<BudgetStatus[]> {
  const db = getDb();
  const [budgets, categories] = await Promise.all([
    db.budgets.toArray().then(alive),
    listCategories(true),
  ]);
  const byCategory = new Map(categories.map((c) => [c.id, c]));
  const current = budgets.filter((b) => b.period_month === periodMonth);

  const statuses: BudgetStatus[] = [];
  for (const budget of current) {
    const used = await usedFor(budget.category_id, budget.period_month);
    const carry = budget.rollover
      ? await rolloverCarry(budgets, budget.category_id, budget.period_month, MAX_ROLLOVER_LOOKBACK)
      : 0;
    const limit = budget.amount_minor + carry;
    statuses.push({
      budget,
      category: byCategory.get(budget.category_id),
      limit,
      used,
      remaining: limit - used,
      ratio: limit > 0 ? used / limit : used > 0 ? 1 : 0,
      carry,
    });
  }

  return statuses.sort((a, b) => b.ratio - a.ratio);
}

async function usedFor(categoryId: string, periodMonth: string): Promise<number> {
  const { from, to } = monthRange(periodMonth);
  const rows = await getDb()
    .transactions.where("[category_id+occurred_on]")
    .between([categoryId, from], [categoryId, to], true, true)
    .toArray();
  return alive(rows)
    .filter((t) => t.type === "expense")
    .reduce((n, t) => n + t.amount_minor, 0);
}

async function rolloverCarry(
  all: Budget[],
  categoryId: string,
  periodMonth: string,
  depth: number,
): Promise<number> {
  if (depth <= 0) return 0;
  const previousMonth = addMonths(periodMonth, -1);
  const previous = all.find(
    (b) => b.category_id === categoryId && b.period_month === previousMonth,
  );
  if (!previous) return 0;

  const carry = previous.rollover
    ? await rolloverCarry(all, categoryId, previousMonth, depth - 1)
    : 0;
  const leftover = previous.amount_minor + carry - (await usedFor(categoryId, previousMonth));
  return Math.max(0, leftover);
}
