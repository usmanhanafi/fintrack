"use client";

import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useBudgets, useCategories } from "@/hooks/use-data";
import { putLocal, removeLocal } from "@/lib/db/mutate";
import { formatMoney, parseMoney } from "@/lib/money";
import { addMonths, daysInMonth, formatMonth, localDay, monthKey } from "@/lib/time";
import type { Budget } from "@/lib/db/types";

export default function BudgetsPage() {
  const today = localDay();
  const [month, setMonth] = useState(monthKey(today));
  const statuses = useBudgets(month);
  const categories = useCategories();
  const [editing, setEditing] = useState<{ categoryId: string; budget?: Budget } | null>(null);

  const months = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addMonths(monthKey(today), 3 - i)),
    [today],
  );

  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const budgeted = new Map(statuses.map((s) => [s.budget.category_id, s]));
  const totals = statuses.reduce(
    (acc, s) => ({ limit: acc.limit + s.limit, used: acc.used + s.used }),
    { limit: 0, used: 0 },
  );

  // Proyeksi memakai laju harian bulan berjalan. Bulan lain tidak diproyeksikan.
  // Sebelum tanggal 5 datanya terlalu sedikit: satu transaksi di hari pertama akan
  // terbaca sebagai tiga puluh kali lipat, dan peringatannya jadi menyesatkan.
  const isCurrentMonth = month === monthKey(today);
  const dayOfMonth = Number(today.slice(8));
  const showProjection = isCurrentMonth && dayOfMonth >= 5;
  const projectionFactor = showProjection ? daysInMonth(month) / dayOfMonth : 1;

  return (
    <div className="flex flex-col gap-4">
      <Select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Pilih bulan budget">
        {months.map((m) => (
          <option key={m} value={m}>
            {formatMonth(m)}
          </option>
        ))}
      </Select>

      <Card>
        <CardTitle>Total budget</CardTitle>
        <p className="tabular mt-1 text-2xl font-semibold">
          {formatMoney(totals.used)}{" "}
          <span className="text-base font-normal text-muted">dari {formatMoney(totals.limit)}</span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${totals.limit ? Math.min(100, (totals.used / totals.limit) * 100) : 0}%` }}
          />
        </div>
      </Card>

      <ul className="flex flex-col gap-2">
        {expenseCategories.map((category) => {
          const status = budgeted.get(category.id);
          const projected = status ? Math.round(status.used * projectionFactor) : 0;
          const overProjected = status && projected > status.limit && status.limit > 0;

          return (
            <li key={category.id}>
              <button
                onClick={() => setEditing({ categoryId: category.id, budget: status?.budget })}
                className="w-full rounded-2xl border border-border bg-surface p-3 text-left active:bg-surface-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: category.color ?? "#94a3b8" }}
                    />
                    <span className="truncate text-sm font-medium">{category.name}</span>
                  </span>
                  {status ? (
                    <span className="tabular shrink-0 text-xs text-muted">
                      {formatMoney(status.used)} / {formatMoney(status.limit)}
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-brand">
                      <Pencil className="size-3.5" aria-hidden="true" />
                      Atur budget
                    </span>
                  )}
                </div>

                {status ? (
                  <>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, status.ratio * 100)}%`,
                          background:
                            status.ratio >= 1
                              ? "var(--danger)"
                              : status.ratio >= 0.8
                                ? "var(--warn)"
                                : "var(--brand)",
                        }}
                      />
                    </div>
                    <p className="tabular mt-1.5 text-xs text-muted">
                      {status.remaining >= 0
                        ? `Sisa ${formatMoney(status.remaining)}`
                        : `Lewat ${formatMoney(-status.remaining)}`}
                      {status.carry > 0 ? ` . bawaan ${formatMoney(status.carry)}` : ""}
                      {showProjection && overProjected
                        ? ` . laju sekarang tembus jadi ${formatMoney(projected)}`
                        : ""}
                    </p>
                  </>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Atur budget">
        {editing ? (
          <BudgetForm
            month={month}
            categoryId={editing.categoryId}
            budget={editing.budget}
            categoryName={categories.find((c) => c.id === editing.categoryId)?.name ?? ""}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function BudgetForm({
  month,
  categoryId,
  categoryName,
  budget,
  onDone,
}: {
  month: string;
  categoryId: string;
  categoryName: string;
  budget?: Budget;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(budget ? String(budget.amount_minor) : "");
  const [rollover, setRollover] = useState(budget?.rollover ?? false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const parsed = parseMoney(amount);
    if (parsed === null || parsed < 0) return setError("Jumlah tidak valid");
    await putLocal<Budget>("budgets", {
      id: budget?.id,
      category_id: categoryId,
      period_month: month,
      amount_minor: parsed,
      rollover,
    });
    onDone();
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-sm text-muted">
        {categoryName} . {formatMonth(month)}
      </p>

      <Field label="Batas bulanan" hint="Boleh ditulis 1jt atau 500rb">
        <Input
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="1500000"
          autoFocus
        />
      </Field>

      <label className="flex items-center gap-3 rounded-xl border border-border p-3">
        <input
          type="checkbox"
          checked={rollover}
          onChange={(e) => setRollover(e.target.checked)}
          className="size-5 accent-[var(--brand)]"
        />
        <span className="text-sm">
          Bawa sisa bulan lalu
          <span className="block text-xs text-muted">
            Sisa yang tidak terpakai menambah batas bulan ini.
          </span>
        </span>
      </label>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        {budget ? (
          <Button
            variant="secondary"
            className="text-danger"
            onClick={async () => {
              await removeLocal("budgets", budget.id);
              onDone();
            }}
          >
            Hapus
          </Button>
        ) : null}
        <Button className="flex-1" onClick={save}>
          Simpan
        </Button>
      </div>
    </div>
  );
}
