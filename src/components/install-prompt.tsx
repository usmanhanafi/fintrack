"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "./ui/button";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "fintrack:install-dismissed";

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // Safari di iOS tidak punya beforeinstallprompt, jadi tampilkan instruksi manual.
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    // localStorage dan userAgent hanya ada di browser, jadi pembacaan ini memang milik effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isIOS) setIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setEvent(null);
    setIosHint(false);
  };

  if (!event && !iosHint) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3">
      <Download className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
      <div className="flex-1 text-sm">
        <p className="font-medium">Pasang FinTrack di perangkat</p>
        {event ? (
          <p className="text-muted">Buka langsung dari layar utama, jalan tanpa internet.</p>
        ) : (
          <p className="flex flex-wrap items-center gap-1 text-muted">
            Ketuk
            <Share className="inline size-4" aria-hidden="true" />
            Bagikan, lalu pilih Tambahkan ke Layar Utama.
          </p>
        )}
        {event ? (
          <Button
            size="sm"
            className="mt-2"
            onClick={async () => {
              await event.prompt();
              await event.userChoice;
              dismiss();
            }}
          >
            Pasang
          </Button>
        ) : null}
      </div>
      <button
        onClick={dismiss}
        aria-label="Tutup ajakan pasang"
        title="Tutup"
        className="rounded-lg p-1 text-muted hover:bg-surface-2"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
