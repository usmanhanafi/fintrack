"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, User, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

interface LoginUser {
  phone: string;
  label: string;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [users, setUsers] = useState<LoginUser[] | null>(null);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/login-options")
      .then((r) => r.json())
      .then((body: { users: LoginUser[] }) => {
        setUsers(body.users);
        if (body.users.length === 1) setPhone(body.users[0].phone);
      })
      .catch(() => setUsers([]));
  }, []);

  const submit = async () => {
    if (!phone) return setError("Pilih nomor terlebih dahulu");
    if (!pin) return setError("Masukkan PIN");

    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, pin }),
    });
    setBusy(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Gagal masuk");
      return;
    }
    router.replace(next);
    router.refresh();
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand text-brand-ink">
          <Wallet className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold">FinTrack</h1>
        <p className="text-sm text-muted">Pilih akun, lalu masukkan PIN.</p>
      </div>

      <div className="flex flex-col gap-4">
        {users === null ? (
          <p className="text-center text-sm text-muted">Memuat...</p>
        ) : users.length === 0 ? (
          <p className="rounded-xl bg-danger/10 px-3 py-2 text-center text-sm text-danger">
            Belum ada nomor terdaftar. Isi ALLOWED_PHONES di env server.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted">Akun</span>
            <div className="flex flex-col gap-2">
              {users.map((u) => (
                <button
                  key={u.phone}
                  type="button"
                  onClick={() => setPhone(u.phone)}
                  aria-pressed={phone === u.phone}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left",
                    phone === u.phone ? "border-brand bg-brand/10" : "border-border",
                  )}
                >
                  <User className="size-4 shrink-0 text-muted" aria-hidden="true" />
                  <span className="text-sm font-medium">{u.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label="PIN">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            placeholder="......"
            className="text-center text-2xl tracking-widest"
            autoFocus
          />
        </Field>

        <Button onClick={submit} disabled={busy || !users?.length} size="lg">
          <KeyRound className="size-4" aria-hidden="true" />
          {busy ? "Memeriksa" : "Masuk"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-center text-sm text-danger">
          {error}
        </p>
      ) : null}
    </main>
  );
}
