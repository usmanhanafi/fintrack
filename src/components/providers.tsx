"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { seedIfEmpty } from "@/lib/db/seed";
import { runRecurring } from "@/lib/domain/recurring";
import { startSyncLoop, subscribeSync, type SyncState } from "@/lib/sync/engine";

const SyncContext = createContext<SyncState>({ status: "idle", pending: 0, lastSyncedAt: null, rejected: 0 });

export function useSyncState() {
  return useContext(SyncContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [sync, setSync] = useState<SyncState>({ status: "idle", pending: 0, lastSyncedAt: null, rejected: 0 });

  useEffect(() => {
    let stop: (() => void) | undefined;
    const unsubscribe = subscribeSync(setSync);

    void (async () => {
      await seedIfEmpty();
      // Jadwal berulang dimaterialisasi saat aplikasi dibuka. Operasi ini idempoten.
      await runRecurring();
      stop = startSyncLoop();
    })();

    return () => {
      unsubscribe();
      stop?.();
    };
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
  }, []);

  return <SyncContext.Provider value={sync}>{children}</SyncContext.Provider>;
}
