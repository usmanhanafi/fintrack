"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { TransactionList } from "@/components/transaction-list";
import { useCategoryTotals, useSummary, useTransactions } from "@/hooks/use-data";
import { formatCompact, formatMoney } from "@/lib/money";
import { addMonths, formatMonth, localDay, monthKey, monthRange } from "@/lib/time";

type RangeKey = "this_month" | "last_month" | "3m" | "ytd";

const RANGES: Array<{ value: RangeKey; label: string }> = [
  { value: "this_month", label: "Bulan ini" },
  { value: "last_month", label: "Bulan lalu" },
  { value: "3m", label: "3 bulan terakhir" },
  { value: "ytd", label: "Tahun berjalan" },
];

function resolveRange(key: RangeKey, today: string): { from: string; to: string } {
  const current = monthKey(today);
  if (key === "this_month") return monthRange(current);
  if (key === "last_month") return monthRange(addMonths(current, -1));
  if (key === "3m") return { from: addMonths(current, -2), to: monthRange(current).to };
  return { from: `${today.slice(0, 4)}-01-01`, to: monthRange(current).to };
}

export default function ReportsPage() {
  const today = localDay();
  const [range, setRange] = useState<RangeKey>("this_month");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [drilldown, setDrilldown] = useState<{ id: string; name: string } | null>(null);

  const { from, to } = resolveRange(range, today);
  const summary = useSummary(from, to);
  const totals = useCategoryTotals(from, to, kind);
  const transactions = useTransactions(from, to);

  const monthly = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const tx of transactions) {
      if (tx.type === "transfer") continue;
      const key = monthKey(tx.occurred_on);
      const bucket = map.get(key) ?? { income: 0, expense: 0 };
      if (tx.type === "income") bucket.income += tx.amount_minor;
      else bucket.expense += tx.amount_minor;
      map.set(key, bucket);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([m, v]) => ({ label: formatMonth(m).slice(0, 3), ...v }));
  }, [transactions]);

  const drilldownRows = useMemo(
    () => (drilldown ? transactions.filter((t) => t.category_id === drilldown.id) : []),
    [drilldown, transactions],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Select value={range} onChange={(e) => setRange(e.target.value as RangeKey)} aria-label="Periode">
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as "expense" | "income")}
          aria-label="Jenis"
        >
          <option value="expense">Pengeluaran</option>
          <option value="income">Pemasukan</option>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <CardTitle>Masuk</CardTitle>
          <p className="tabular mt-1 text-sm font-semibold text-ok">{formatCompact(summary.income)}</p>
        </Card>
        <Card className="p-3">
          <CardTitle>Keluar</CardTitle>
          <p className="tabular mt-1 text-sm font-semibold">{formatCompact(summary.expense)}</p>
        </Card>
        <Card className="p-3">
          <CardTitle>Selisih</CardTitle>
          <p className="tabular mt-1 text-sm font-semibold">{formatCompact(summary.net)}</p>
        </Card>
      </div>

      <Card>
        <CardTitle>Per kategori</CardTitle>
        {totals.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Belum ada data pada periode ini</p>
        ) : (
          <>
            <div className="mt-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={totals}
                    dataKey="total"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {totals.map((t) => (
                      <Cell key={t.category_id} fill={t.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                      color: "var(--text)",
                    }}
                    formatter={(value, name) => [formatMoney(Number(value)), String(name)]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={24}
                    wrapperStyle={{ fontSize: 11, color: "var(--muted)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <ul className="mt-2 flex flex-col">
              {totals.map((t) => (
                <li key={t.category_id}>
                  <button
                    onClick={() => setDrilldown({ id: t.category_id, name: t.name })}
                    className="flex w-full items-center gap-3 border-b border-border py-2.5 text-left last:border-b-0"
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: t.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                    <span className="tabular text-xs text-muted">{Math.round(t.share * 100)}%</span>
                    <span className="tabular w-28 text-right text-sm">{formatMoney(t.total)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {monthly.length > 1 ? (
        <Card>
          <CardTitle>Masuk dan keluar per bulan</CardTitle>
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted)" }} />
                <YAxis
                  tickFormatter={formatCompact}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                    color: "var(--text)",
                  }}
                  formatter={(value) => formatMoney(Number(value))}
                />
                <Bar dataKey="income" name="Masuk" fill="var(--ok)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="expense" name="Keluar" fill="var(--warn)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}

      <Sheet open={!!drilldown} onClose={() => setDrilldown(null)} title={drilldown?.name ?? ""}>
        <div className="p-4">
          <TransactionList transactions={drilldownRows} />
        </div>
      </Sheet>
    </div>
  );
}
