"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

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

  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!phone) return setError("Masukkan nomor HP");
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
        <p className="text-sm text-muted">Masuk dengan nomor HP dan PIN.</p>
      </div>

      <div className="flex flex-col gap-4">
        <Field label="Nomor HP">
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="username"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+6281234567890"
            autoFocus
          />
        </Field>

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
          />
        </Field>

        <Button onClick={submit} disabled={busy} size="lg">
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
