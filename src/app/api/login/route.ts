import { NextResponse } from "next/server";
import { createSession, destroySession, verifyLogin } from "@/lib/session";

// Dibatasi per nomor, bukan per IP: aplikasi pribadi ini sering diakses dari
// jaringan rumah yang sama (NAT), jadi kunci per-IP bisa mengunci semua orang
// di baliknya gara-gara satu orang salah ketik PIN berkali-kali.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;

function rateLimited(key: string): boolean {
  const now = Date.now();
  // Sekalian buang entri basi supaya Map ini tidak tumbuh tanpa batas.
  if (attempts.size > 500) {
    for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
  }

  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  let body: { phone?: string; pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "bad_json", message: "Permintaan tidak valid" } }, { status: 400 });
  }

  const key = (body.phone ?? "").trim() || "unknown";
  if (rateLimited(key)) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "Terlalu sering mencoba. Tunggu beberapa menit." } },
      { status: 429 },
    );
  }

  const user = verifyLogin(body.phone ?? "", body.pin ?? "");
  if (!user) {
    return NextResponse.json(
      { error: { code: "invalid_credentials", message: "Nomor atau PIN salah" } },
      { status: 401 },
    );
  }

  attempts.delete(key);
  await createSession(user.userId);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
