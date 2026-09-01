"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, LogOut, Moon, Plus, Sun, Upload, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useAccounts, useBalances, useCategories } from "@/hooks/use-data";
import { putLocal } from "@/lib/db/mutate";
import { resetLocalData } from "@/lib/db/dexie";
import { commitImport, download, exportCsv, exportJson, previewImport, type ImportPreview } from "@/lib/domain/csv";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatMoney, parseMoney } from "@/lib/money";
import { localDay, monthKey, monthRange } from "@/lib/time";
import type { Account, AccountType, Category, CategoryKind } from "@/lib/db/types";

export default function SettingsPage() {
  const router = useRouter();
  const accounts = useAccounts(true);
  const categories = useCategories(true);
  const balances = useBalances();
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [accountSheet, setAccountSheet] = useState<{ account?: Account } | null>(null);
  const [categorySheet, setCategorySheet] = useState<{ category?: Category } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = (localStorage.getItem("fintrack:theme") as typeof theme) ?? "system";
    // Tema tersimpan di localStorage yang tidak ada saat render di server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(saved);
    applyTheme(saved);
  }, []);

  const changeTheme = (next: typeof theme) => {
    setTheme(next);
    localStorage.setItem("fintrack:theme", next);
    applyTheme(next);
  };

  const signOut = async () => {
    if (!confirm("Keluar akun? Data lokal di perangkat ini akan dihapus.")) return;
    await fetch("/api/login", { method: "DELETE" });
    await resetLocalData();
    router.replace("/login");
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Tampilan</CardTitle>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["system", "light", "dark"] as const).map((option) => (
            <button
              key={option}
              onClick={() => changeTheme(option)}
              aria-pressed={theme === option}
              className={`flex h-10 items-center justify-center gap-1.5 rounded-xl border text-sm ${
                theme === option ? "border-brand bg-brand/10" : "border-border"
              }`}
            >
              {option === "light" ? (
                <Sun className="size-4" aria-hidden="true" />
              ) : option === "dark" ? (
                <Moon className="size-4" aria-hidden="true" />
              ) : null}
              {option === "system" ? "Sistem" : option === "light" ? "Terang" : "Gelap"}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Akun dan dompet</CardTitle>
          <Button size="sm" variant="secondary" onClick={() => setAccountSheet({})}>
            <Plus className="size-4" aria-hidden="true" />
            Tambah
          </Button>
        </div>
        <ul className="mt-2">
          {accounts.map((a) => (
            <li key={a.id} className="border-b border-border last:border-b-0">
              <button
                onClick={() => setAccountSheet({ account: a })}
                className="flex w-full items-center gap-3 py-2.5 text-left"
              >
                <Wallet className="size-4 shrink-0" style={{ color: a.color ?? undefined }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {a.name}
                  {a.archived_at ? <span className="text-muted"> . arsip</span> : null}
                </span>
                <span className="tabular text-sm">{formatMoney(balances.get(a.id) ?? 0)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Kategori</CardTitle>
          <Button size="sm" variant="secondary" onClick={() => setCategorySheet({})}>
            <Plus className="size-4" aria-hidden="true" />
            Tambah
          </Button>
        </div>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setCategorySheet({ category: c })}
                className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-xs"
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ background: c.color ?? "#94a3b8" }}
                />
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>Data</CardTitle>
        <p className="mt-1 text-xs text-muted">
          Ekspor menghasilkan berkas yang bisa dibuka di Excel atau Google Sheets, lalu diimpor
          kembali tanpa menghasilkan duplikat.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              const { from, to } = monthRange(monthKey(localDay()));
              download(`fintrack-${from.slice(0, 7)}.csv`, await exportCsv(from, to), "text/csv");
            }}
          >
            <Download className="size-4" aria-hidden="true" />
            CSV bulan ini
          </Button>
          <Button
            variant="secondary"
            onClick={async () =>
              download(`fintrack-backup-${localDay()}.json`, await exportJson(), "application/json")
            }
          >
            <Download className="size-4" aria-hidden="true" />
            Cadangan JSON
          </Button>
          <Button variant="secondary" className="col-span-2" onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" aria-hidden="true" />
            Impor CSV
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPreview(await previewImport(await file.text()));
            e.target.value = "";
          }}
        />
        {importMessage ? <p className="mt-2 text-sm text-ok">{importMessage}</p> : null}
      </Card>

      {isSupabaseConfigured ? (
        <Button variant="secondary" className="text-danger" onClick={signOut}>
          <LogOut className="size-4" aria-hidden="true" />
          Keluar
        </Button>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted">
          Mode lokal. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY untuk
          menyalakan masuk lewat nomor WhatsApp dan sinkronisasi antar perangkat.
        </p>
      )}

      <Sheet
        open={!!accountSheet}
        onClose={() => setAccountSheet(null)}
        title={accountSheet?.account ? "Ubah akun" : "Akun baru"}
      >
        {accountSheet ? (
          <AccountForm account={accountSheet.account} onDone={() => setAccountSheet(null)} />
        ) : null}
      </Sheet>

      <Sheet
        open={!!categorySheet}
        onClose={() => setCategorySheet(null)}
        title={categorySheet?.category ? "Ubah kategori" : "Kategori baru"}
      >
        {categorySheet ? (
          <CategoryForm category={categorySheet.category} onDone={() => setCategorySheet(null)} />
        ) : null}
      </Sheet>

      <Sheet open={!!preview} onClose={() => setPreview(null)} title="Pratinjau impor">
        {preview ? (
          <ImportPreviewPanel
            preview={preview}
            onCancel={() => setPreview(null)}
            onDone={(n) => {
              setPreview(null);
              setImportMessage(`${n} transaksi diimpor`);
            }}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function applyTheme(theme: "system" | "light" | "dark") {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

const ACCOUNT_TYPES: Array<{ value: AccountType; label: string }> = [
  { value: "cash", label: "Tunai" },
  { value: "bank", label: "Bank" },
  { value: "ewallet", label: "E-Wallet" },
  { value: "credit_card", label: "Kartu kredit" },
];

function AccountForm({ account, onDone }: { account?: Account; onDone: () => void }) {
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "cash");
  const [opening, setOpening] = useState(String(account?.opening_balance_minor ?? 0));
  const [color, setColor] = useState(account?.color ?? "#2563eb");

  const save = async () => {
    if (!name.trim()) return;
    await putLocal<Account>("accounts", {
      id: account?.id,
      name: name.trim(),
      type,
      opening_balance_minor: parseMoney(opening) ?? 0,
      icon: account?.icon ?? null,
      color,
      sort_order: account?.sort_order ?? 99,
      archived_at: account?.archived_at ?? null,
    });
    onDone();
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <Field label="Nama">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="Tipe">
        <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Saldo awal" hint="Saldo saat mulai mencatat">
        <Input inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} />
      </Field>
      <Field label="Warna">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-surface"
        />
      </Field>
      <div className="flex gap-2">
        {account ? (
          <Button
            variant="secondary"
            onClick={async () => {
              await putLocal<Account>("accounts", {
                ...account,
                archived_at: account.archived_at ? null : new Date().toISOString(),
              });
              onDone();
            }}
          >
            {account.archived_at ? "Aktifkan" : "Arsipkan"}
          </Button>
        ) : null}
        <Button className="flex-1" onClick={save}>
          Simpan
        </Button>
      </div>
    </div>
  );
}

function CategoryForm({ category, onDone }: { category?: Category; onDone: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? "expense");
  const [color, setColor] = useState(category?.color ?? "#f97316");

  return (
    <div className="flex flex-col gap-4 p-4">
      <Field label="Nama">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="Jenis">
        <Select value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)}>
          <option value="expense">Pengeluaran</option>
          <option value="income">Pemasukan</option>
        </Select>
      </Field>
      <Field label="Warna">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-surface"
        />
      </Field>
      <div className="flex gap-2">
        {category ? (
          <Button
            variant="secondary"
            className="text-danger"
            onClick={async () => {
              // Kategori yang masih dipakai tidak dihapus, cukup diarsipkan.
              if (!confirm("Arsipkan kategori ini?")) return;
              await putLocal<Category>("categories", {
                ...category,
                archived_at: category.archived_at ? null : new Date().toISOString(),
              });
              onDone();
            }}
          >
            {category.archived_at ? "Aktifkan" : "Arsipkan"}
          </Button>
        ) : null}
        <Button
          className="flex-1"
          onClick={async () => {
            if (!name.trim()) return;
            await putLocal<Category>("categories", {
              id: category?.id,
              parent_id: null,
              name: name.trim(),
              kind,
              icon: category?.icon ?? null,
              color,
              sort_order: category?.sort_order ?? 99,
              archived_at: category?.archived_at ?? null,
            });
            onDone();
          }}
        >
          Simpan
        </Button>
      </div>
    </div>
  );
}

function ImportPreviewPanel({
  preview,
  onCancel,
  onDone,
}: {
  preview: ImportPreview;
  onCancel: () => void;
  onDone: (count: number) => void;
}) {
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface-2 p-2">
          <p className="tabular text-lg font-semibold text-ok">{preview.newCount}</p>
          <p className="text-xs text-muted">baris baru</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <p className="tabular text-lg font-semibold text-warn">{preview.duplicateCount}</p>
          <p className="text-xs text-muted">duplikat</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <p className="tabular text-lg font-semibold text-danger">{preview.failedCount}</p>
          <p className="text-xs text-muted">gagal</p>
        </div>
      </div>

      {preview.duplicateCount > 0 ? (
        <label className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
          <input
            type="checkbox"
            checked={includeDuplicates}
            onChange={(e) => setIncludeDuplicates(e.target.checked)}
            className="size-5 accent-[var(--brand)]"
          />
          Ikutkan baris yang terdeteksi duplikat
        </label>
      ) : null}

      <ul className="max-h-64 overflow-y-auto rounded-xl border border-border text-xs">
        {preview.rows.slice(0, 50).map((row, i) => (
          <li key={i} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{
                background: row.problem ? "var(--danger)" : row.duplicate ? "var(--warn)" : "var(--ok)",
              }}
            />
            <span className="min-w-0 flex-1 truncate">
              {row.tx ? `${row.tx.occurred_on} . ${formatMoney(row.tx.amount_minor)}` : row.raw.join(" ")}
            </span>
            {row.problem ? <span className="shrink-0 text-danger">{row.problem}</span> : null}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Batal
        </Button>
        <Button
          className="flex-1"
          disabled={busy || preview.newCount + (includeDuplicates ? preview.duplicateCount : 0) === 0}
          onClick={async () => {
            setBusy(true);
            const n = await commitImport(preview, { includeDuplicates });
            onDone(n);
          }}
        >
          Impor {preview.newCount + (includeDuplicates ? preview.duplicateCount : 0)} baris
        </Button>
      </div>
    </div>
  );
}
