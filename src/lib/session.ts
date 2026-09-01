import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { v5 as uuidv5 } from "uuid";
import { normalizePhone } from "@/lib/phone";

const COOKIE_NAME = "fintrack_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 hari, ini aplikasi pribadi, bukan sesi publik

// Namespace tetap, hanya dipakai untuk menurunkan UUID stabil dari nomor telepon.
// Bukan rahasia: UUID v5 memang deterministik dari input + namespace ini.
const PHONE_NAMESPACE = "3f6a6d2e-6b8b-4c1a-9d2e-2a6b8b4c1a9d";

export interface AllowedUser {
  phone: string;
  label: string;
  userId: string;
}

/** Daftar nomor yang boleh login. Kosong berarti login dimatikan total, bukan dibuka. */
export function allowedUsers(): AllowedUser[] {
  const raw = process.env.ALLOWED_PHONES ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      // Format opsional "+628xxx:Nama". Tanpa label, nomor itu sendiri dipakai.
      const [rawPhone, label] = entry.split(":");
      const phone = normalizePhone(rawPhone) ?? rawPhone;
      return { phone, label: label?.trim() || phone, userId: uuidv5(phone, PHONE_NAMESPACE) };
    });
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET belum diisi di env");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** userId.expiryEpoch.signature. Tanpa state di server, jadi tidak butuh tabel sesi. */
function issueToken(userId: string): string {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresRaw, signature] = parts;
  const payload = `${userId}.${expiresRaw}`;
  const expected = sign(payload);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now() / 1000) return null;
  return userId;
}

/** Memeriksa PIN dengan waktu konstan, supaya panjang PIN yang salah tidak bisa ditebak dari timing. */
function pinMatches(input: string): boolean {
  const expected = process.env.LOGIN_PIN ?? "";
  if (!expected) return false;
  const a = Buffer.from(input.padEnd(32, "\0"));
  const b = Buffer.from(expected.padEnd(32, "\0"));
  return a.length === b.length && timingSafeEqual(a, b) && input.length === expected.length;
}

export function verifyLogin(phone: string, pin: string): AllowedUser | null {
  if (!pinMatches(pin)) return null;
  const normalized = normalizePhone(phone);
  return allowedUsers().find((u) => u.phone === normalized) ?? null;
}

export async function createSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, issueToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}
