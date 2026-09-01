"use client";

import { CloudOff, RefreshCw, TriangleAlert, Check } from "lucide-react";
import { useSyncState } from "./providers";
import { requestSync } from "@/lib/sync/engine";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function SyncBadge() {
  const sync = useSyncState();

  if (!isSupabaseConfigured) {
    return (
      <span className="rounded-full border border-border bg-surface px-2.5 py-1.5 text-xs text-muted">
        Mode lokal
      </span>
    );
  }

  const { icon, label } = (() => {
    if (sync.status === "offline")
      return { icon: <CloudOff className="size-4" aria-hidden="true" />, label: "Offline" };
    if (sync.status === "syncing")
      return {
        icon: <RefreshCw className="size-4 animate-spin" aria-hidden="true" />,
        label: "Menyinkronkan",
      };
    if (sync.status === "error")
      return { icon: <TriangleAlert className="size-4" aria-hidden="true" />, label: "Gagal sync" };
    return { icon: <Check className="size-4" aria-hidden="true" />, label: "Tersimpan" };
  })();

  return (
    <button
      onClick={() => void requestSync()}
      title={sync.message ?? label}
      aria-label={`Status sinkronisasi: ${label}. Ketuk untuk mencoba lagi`}
      className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1.5 text-xs text-muted"
    >
      {icon}
      <span>{label}</span>
      {sync.pending > 0 ? (
        <span className="tabular rounded-full bg-warn/15 px-1.5 text-warn">{sync.pending}</span>
      ) : null}
    </button>
  );
}
