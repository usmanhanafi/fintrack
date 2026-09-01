"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ChartPie, House, Plus, Settings, Target, Receipt } from "lucide-react";
import { Sheet } from "./ui/sheet";
import { SyncBadge } from "./sync-badge";
import { TransactionForm } from "./transaction-form";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Beranda", icon: House },
  { href: "/transactions", label: "Transaksi", icon: Receipt },
  { href: "/budgets", label: "Budget", icon: Target },
  { href: "/reports", label: "Laporan", icon: ChartPie },
  { href: "/settings", label: "Atur", icon: Settings },
];

/** Shortcut homescreen "Tambah pengeluaran" (lihat manifest.ts) membuka app
 * lewat /?add=expense. Query dibuang lagi supaya tidak retrigger saat reload. */
function AddShortcutListener({ onTrigger }: { onTrigger: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("add") === "expense") {
      onTrigger();
      router.replace(pathname);
    }
  }, [searchParams, pathname, router, onTrigger]);

  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [adding, setAdding] = useState(false);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <Suspense fallback={null}>
        <AddShortcutListener onTrigger={() => setAdding(true)} />
      </Suspense>

      <header className="safe-top sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/90 px-4 py-3 backdrop-blur">
        <Link href="/" className="text-base font-semibold tracking-tight">
          FinTrack
        </Link>
        <SyncBadge />
      </header>

      <main className="flex-1 px-4 pb-40 pt-4">{children}</main>

      <button
        onClick={() => setAdding(true)}
        aria-label="Tambah transaksi"
        title="Tambah transaksi"
        className="fixed bottom-24 right-4 z-40 flex size-14 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg active:scale-95"
      >
        <Plus className="size-7" aria-hidden="true" />
      </button>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-2xl border-t border-border bg-surface">
        <ul className="grid grid-cols-5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-[11px]",
                    active ? "text-brand" : "text-muted",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Transaksi baru">
        <TransactionForm onDone={() => setAdding(false)} />
      </Sheet>
    </div>
  );
}
