"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import { TransactionList } from "@/components/transaction-list";
import { useAccounts, useCategories, useTransactions } from "@/hooks/use-data";
import { formatMoney } from "@/lib/money";
import { addMonths, formatMonth, localDay, monthKey, monthRange } from "@/lib/time";
import type { TxType } from "@/lib/db/types";

export default function TransactionsPage() {
  const [month, setMonth] = useState(monthKey(localDay()));
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TxType | "all">("all");
  const [accountId, setAccountId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");

  const { from, to } = monthRange(month);
  const all = useTransactions(from, to);
  const accounts = useAccounts(true);
  const categories = useCategories(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((tx) => {
      if (type !== "all" && tx.type !== type) return false;
      if (accountId !== "all" && tx.account_id !== accountId && tx.to_account_id !== accountId)
        return false;
      if (categoryId !== "all" && tx.category_id !== categoryId) return false;
      if (!q) return true;
      const category = categories.find((c) => c.id === tx.category_id)?.name ?? "";
      return `${tx.note ?? ""} ${tx.merchant ?? ""} ${category}`.toLowerCase().includes(q);
    });
  }, [all, query, type, accountId, categoryId, categories]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of filtered) {
      if (tx.type === "income") income += tx.amount_minor;
      if (tx.type === "expense") expense += tx.amount_minor;
    }
    return { income, expense };
  }, [filtered]);

  const months = useMemo(
    () => Array.from({ length: 13 }, (_, i) => addMonths(monthKey(localDay()), -i)),
    [],
  );

  return (
    <div className="flex flex-col gap-3">
      <Select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Pilih bulan">
        {months.map((m) => (
          <option key={m} value={m}>
            {formatMonth(m)}
          </option>
        ))}
      </Select>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari catatan atau kategori"
          className="pl-9"
          aria-label="Cari transaksi"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Select value={type} onChange={(e) => setType(e.target.value as TxType | "all")} aria-label="Filter tipe">
          <option value="all">Semua tipe</option>
          <option value="expense">Keluar</option>
          <option value="income">Masuk</option>
          <option value="transfer">Transfer</option>
        </Select>
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Filter akun">
          <option value="all">Semua akun</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Filter kategori"
        >
          <option value="all">Semua kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
        <span className="text-muted">{filtered.length} transaksi</span>
        <span className="tabular">
          <span className="text-ok">+{formatMoney(totals.income)}</span>
          <span className="mx-1.5 text-muted">/</span>
          <span>-{formatMoney(totals.expense)}</span>
        </span>
      </div>

      <TransactionList transactions={filtered} emptyLabel="Tidak ada transaksi pada filter ini" />
    </div>
  );
}
