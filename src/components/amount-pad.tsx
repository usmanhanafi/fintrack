"use client";

import { Delete } from "lucide-react";
import { formatNumber, parseMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0"];

/**
 * Keypad angka khusus. Input teks biasa memunculkan keyboard sistem yang lambat
 * dan membiarkan karakter tak terduga masuk.
 */
export function AmountPad({
  value,
  onChange,
  onSubmit,
  submitLabel,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
}) {
  const parsed = parseMoney(value);
  const isExpression = /[+-]/.test(value.slice(1));

  const press = (key: string) => {
    if (value === "0" && key !== "000") onChange(key);
    else onChange(value + key);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl bg-surface-2 px-4 py-5 text-right">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">Jumlah</div>
        <div className="tabular mt-1 break-all text-4xl font-semibold leading-tight">
          {isExpression ? value : parsed === null ? "0" : formatNumber(parsed)}
        </div>
        {isExpression && parsed !== null ? (
          <div className="tabular mt-1 text-sm text-muted">= Rp{formatNumber(parsed)}</div>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            className="tabular h-14 rounded-xl bg-surface-2 text-xl font-medium active:bg-border"
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange(value.length > 1 ? value.slice(0, -1) : "0")}
          aria-label="Hapus satu angka"
          title="Hapus satu angka"
          className="flex h-14 items-center justify-center rounded-xl bg-surface-2 active:bg-border"
        >
          <Delete className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(`${value}+`)}
          className="h-11 rounded-xl bg-surface-2 text-lg font-medium active:bg-border"
          aria-label="Tambah"
          title="Jumlahkan beberapa angka"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => onChange(`${value}-`)}
          className="h-11 rounded-xl bg-surface-2 text-lg font-medium active:bg-border"
          aria-label="Kurang"
          title="Kurangi"
        >
          -
        </button>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || parsed === null || parsed <= 0}
        className={cn(
          "h-13 min-h-12 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-brand-ink",
          "disabled:opacity-50",
        )}
      >
        {submitLabel}
      </button>
    </div>
  );
}
