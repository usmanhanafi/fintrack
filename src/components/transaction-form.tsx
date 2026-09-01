"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { AmountPad } from "./amount-pad";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { putLocal, removeLocal } from "@/lib/db/mutate";
import { useAccounts, useCategories } from "@/hooks/use-data";
import { formatNumber, parseMoney } from "@/lib/money";
import { fromLocalInput, localDay, toLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Transaction, TxType } from "@/lib/db/types";

const TYPES: Array<{ value: TxType; label: string }> = [
  { value: "expense", label: "Pengeluaran" },
  { value: "income", label: "Pemasukan" },
  { value: "transfer", label: "Transfer" },
];

const LAST_ACCOUNT_KEY = "fintrack:last-account";

export function TransactionForm({
  existing,
  onDone,
}: {
  existing?: Transaction;
  onDone: () => void;
}) {
  const accounts = useAccounts();
  const categories = useCategories();

  const [type, setType] = useState<TxType>(existing?.type ?? "expense");
  const [amount, setAmount] = useState(existing ? String(existing.amount_minor) : "0");
  const [accountId, setAccountId] = useState(existing?.account_id ?? "");
  const [toAccountId, setToAccountId] = useState(existing?.to_account_id ?? "");
  const [categoryId, setCategoryId] = useState(existing?.category_id ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [when, setWhen] = useState(toLocalInput(existing?.occurred_at ?? new Date().toISOString()));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === (type === "income" ? "income" : "expense")),
    [categories, type],
  );

  // Nilai bawaan diturunkan saat render, bukan lewat effect, supaya tidak ada
  // render tambahan dan form langsung siap pada frame pertama.
  const lastAccount = typeof window !== "undefined" ? localStorage.getItem(LAST_ACCOUNT_KEY) : null;
  const effectiveAccountId =
    accountId && accounts.some((a) => a.id === accountId)
      ? accountId
      : lastAccount && accounts.some((a) => a.id === lastAccount)
        ? lastAccount
        : (accounts[0]?.id ?? "");

  const effectiveCategoryId =
    categoryId && visibleCategories.some((c) => c.id === categoryId)
      ? categoryId
      : (visibleCategories[0]?.id ?? "");

  const save = async () => {
    const parsed = parseMoney(amount);
    if (parsed === null || parsed <= 0) return setError("Jumlah harus lebih dari nol");
    if (!effectiveAccountId) return setError("Pilih akun");
    if (type === "transfer") {
      if (!toAccountId) return setError("Pilih akun tujuan");
      if (toAccountId === effectiveAccountId) return setError("Akun asal dan tujuan tidak boleh sama");
    } else if (!effectiveCategoryId) {
      return setError("Pilih kategori");
    }

    setSaving(true);
    setError(null);
    const occurredAt = fromLocalInput(when);

    try {
      await putLocal<Transaction>("transactions", {
        id: existing?.id,
        type,
        amount_minor: parsed,
        account_id: effectiveAccountId,
        to_account_id: type === "transfer" ? toAccountId : null,
        category_id: type === "transfer" ? null : effectiveCategoryId,
        note: note.trim() || null,
        merchant: null,
        tags: existing?.tags ?? [],
        occurred_at: occurredAt,
        occurred_on: localDay(occurredAt),
        recurring_id: existing?.recurring_id ?? null,
        source: existing?.source ?? "app",
        external_ref: existing?.external_ref ?? null,
        import_batch_id: existing?.import_batch_id ?? null,
      });
      localStorage.setItem(LAST_ACCOUNT_KEY, effectiveAccountId);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirm("Hapus transaksi ini?")) return;
    await removeLocal("transactions", existing.id);
    onDone();
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            aria-pressed={type === t.value}
            className={cn(
              "h-9 rounded-lg text-sm font-medium transition",
              type === t.value ? "bg-surface text-text shadow-sm" : "text-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AmountPad
        value={amount}
        onChange={setAmount}
        onSubmit={save}
        disabled={saving}
        submitLabel={existing ? "Simpan perubahan" : "Simpan"}
      />

      <Field label={type === "transfer" ? "Dari akun" : "Akun"}>
        <Select value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>

      {type === "transfer" ? (
        <Field label="Ke akun">
          <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            <option value="">Pilih akun tujuan</option>
            {accounts
              .filter((a) => a.id !== effectiveAccountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
        </Field>
      ) : (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-muted">Kategori</span>
          <div className="grid grid-cols-2 gap-2">
            {visibleCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                aria-pressed={effectiveCategoryId === c.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm",
                  effectiveCategoryId === c.id
                    ? "border-brand bg-brand/10 font-medium"
                    : "border-border bg-surface",
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: c.color ?? "#94a3b8" }}
                />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <Field label="Waktu">
        <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </Field>

      <Field label="Catatan" hint="Opsional">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Makan siang di kantin"
          maxLength={200}
        />
      </Field>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        {existing ? (
          <Button variant="secondary" onClick={remove} className="text-danger">
            <Trash2 className="size-4" aria-hidden="true" />
            Hapus
          </Button>
        ) : null}
        <Button onClick={save} disabled={saving} className="flex-1">
          {saving ? "Menyimpan" : existing ? "Simpan perubahan" : `Simpan Rp${formatNumber(parseMoney(amount) ?? 0)}`}
        </Button>
      </div>
    </div>
  );
}
