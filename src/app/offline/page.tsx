import Link from "next/link";
import { CloudOff } from "lucide-react";

export const metadata = { title: "Offline . FinTrack" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <CloudOff className="size-10 text-muted" aria-hidden="true" />
      <h1 className="text-lg font-semibold">Halaman ini belum tersimpan</h1>
      <p className="text-sm text-muted">
        Aplikasi tetap bisa dipakai untuk mencatat. Buka beranda, lalu catat seperti biasa.
        Perubahan akan dikirim sendiri saat koneksi kembali.
      </p>
      <Link href="/" className="mt-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-ink">
        Ke beranda
      </Link>
    </main>
  );
}
