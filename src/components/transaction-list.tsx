"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Sheet } from "./ui/sheet";
import { TransactionForm } from "./transaction-form";
import { useAccounts, useCategories } from "@/hooks/use-data";
import { formatMoney } from "@/lib/money";
import { formatDayRelative } from "@/lib/time";
import type { Transaction } from "@/lib/db/types";

export function TransactionList({
  transactions,
  emptyLabel = "Belum ada transaksi",
}: {
  transactions: Transaction[];
  emptyLabel?: string;
}) {
  const accounts = useAccounts(true);
  const categories = useCategories(true);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const accountName = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );
  const category = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of transactions) {
      const list = map.get(tx.occurred_on) ?? [];
      list.push(tx);
      map.set(tx.occurred_on, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [transactions]);

  if (transactions.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
        {emptyLabel}
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {groups.map(([day, rows]) => {
          const net = rows.reduce(
            (n, t) => n + (t.type === "income" ? t.amount_minor : t.type === "expense" ? -t.amount_minor : 0),
            0,
          );
          return (
            <section key={day}>
              <header className="mb-1.5 flex items-baseline justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {formatDayRelative(day)}
                </h3>
                <span className="tabular text-xs text-muted">{formatMoney(net)}</span>
              </header>
              <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
                {rows.map((tx) => {
                  const cat = tx.category_id ? category.get(tx.category_id) : undefined;
                  const Icon =
                    tx.type === "transfer"
                      ? ArrowLeftRight
                      : tx.type === "income"
                        ? ArrowDownLeft
                        : ArrowUpRight;
                  const label =
                    tx.type === "transfer"
                      ? `${accountName.get(tx.account_id) ?? "?"} ke ${accountName.get(tx.to_account_id ?? "") ?? "?"}`
                      : (cat?.name ?? "Tanpa kategori");
                  return (
                    <li key={tx.id} className="border-b border-border last:border-b-0">
                      <button
                        onClick={() => setEditing(tx)}
                        className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-surface-2"
                      >
                        <span
                          aria-hidden="true"
                          className="flex size-9 shrink-0 items-center justify-center rounded-full"
                          style={{ background: `${cat?.color ?? "#94a3b8"}22`, color: cat?.color ?? "#94a3b8" }}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{label}</span>
                          <span className="block truncate text-xs text-muted">
                            {tx.note || accountName.get(tx.account_id) || ""}
                            {tx.source === "whatsapp" ? " . dari WhatsApp" : ""}
                            {tx.source === "recurring" ? " . otomatis" : ""}
                          </span>
                        </span>
                        <span
                          className={
                            tx.type === "income"
                              ? "tabular text-sm font-semibold text-ok"
                              : tx.type === "expense"
                                ? "tabular text-sm font-semibold"
                                : "tabular text-sm font-semibold text-muted"
                          }
                        >
                          {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}
                          {formatMoney(tx.amount_minor)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Ubah transaksi">
        {editing ? (
          <TransactionForm existing={editing} onDone={() => setEditing(null)} />
        ) : null}
      </Sheet>
    </>
  );
}
