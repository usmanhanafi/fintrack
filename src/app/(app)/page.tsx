"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { InstallPrompt } from "@/components/install-prompt";
import { TransactionList } from "@/components/transaction-list";
import {
  useAccounts,
  useBalances,
  useBudgets,
  useDailyTotals,
  useSummary,
  useTransactions,
} from "@/hooks/use-data";
import { formatCompact, formatMoney } from "@/lib/money";
import { addDays, formatMonth, localDay, monthKey, monthRange } from "@/lib/time";

export default function DashboardPage() {
  const today = localDay();
  const month = monthKey(today);
  const { from, to } = monthRange(month);
  const chartFrom = addDays(today, -29);

  const accounts = useAccounts();
  const balances = useBalances();
  const summary = useSummary(from, to);
  const daily = useDailyTotals(chartFrom, today);
  const budgets = useBudgets(month);
  const recent = useTransactions(addDays(today, -60), today);

  const total = useMemo(
    () => accounts.reduce((n, a) => n + (balances.get(a.id) ?? 0), 0),
    [accounts, balances],
  );

  const chartData = useMemo(() => {
    const map = new Map(daily.map((d) => [d.day, d.expense]));
    return Array.from({ length: 30 }, (_, i) => {
      const day = addDays(chartFrom, i);
      return { day, label: day.slice(8), expense: map.get(day) ?? 0 };
    });
  }, [daily, chartFrom]);

  const atRisk = budgets.filter((b) => b.ratio >= 0.8);

  return (
    <div className="flex flex-col gap-4">
      <InstallPrompt />

      <Card>
        <CardTitle>Total saldo</CardTitle>
        <p className="tabular mt-1 text-3xl font-semibold">{formatMoney(total)}</p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ background: a.color ?? "#94a3b8" }}
                />
                {a.name}
              </span>
              <span className="tabular">{formatMoney(balances.get(a.id) ?? 0)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardTitle>Masuk</CardTitle>
          <p className="tabular mt-1 text-xl font-semibold text-ok">{formatMoney(summary.income)}</p>
          <p className="mt-0.5 text-xs text-muted">{formatMonth(month)}</p>
        </Card>
        <Card>
          <CardTitle>Keluar</CardTitle>
          <p className="tabular mt-1 text-xl font-semibold">{formatMoney(summary.expense)}</p>
          <p className="mt-0.5 text-xs text-muted">
            Selisih {formatMoney(summary.net)}
          </p>
        </Card>
      </div>

      {atRisk.length > 0 ? (
        <Card>
          <CardTitle>Budget perlu perhatian</CardTitle>
          <ul className="mt-2 flex flex-col gap-3">
            {atRisk.map((b) => (
              <li key={b.budget.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>{b.category?.name ?? "Kategori"}</span>
                  <span className="tabular text-xs text-muted">
                    {formatMoney(b.used)} dari {formatMoney(b.limit)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, b.ratio * 100)}%`,
                      background: b.ratio >= 1 ? "var(--danger)" : "var(--warn)",
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardTitle>Pengeluaran 30 hari</CardTitle>
        <div className="mt-3 h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={6}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
              />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "var(--text)",
                }}
                formatter={(value) => formatMoney(Number(value))}
                labelFormatter={(label) => `Tanggal ${String(label)}`}
              />
              <Bar dataKey="expense" fill="var(--brand)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted">
          Rata-rata harian {formatCompact(Math.round(summary.expense / Math.max(1, Number(today.slice(8)))))}
        </p>
      </Card>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Terakhir</h2>
          <Link href="/transactions" className="text-sm text-brand">
            Lihat semua
          </Link>
        </div>
        <TransactionList
          transactions={recent.slice(0, 5)}
          emptyLabel="Belum ada transaksi. Ketuk tombol tambah untuk mencatat yang pertama."
        />
      </section>
    </div>
  );
}
