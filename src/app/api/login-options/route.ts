import { NextResponse } from "next/server";
import { allowedUsers } from "@/lib/session";

/**
 * Daftar nomor allowlist dikirim ke halaman login supaya bisa dipilih lewat tombol,
 * bukan diketik. Ini aplikasi pribadi dengan allowlist kecil (env), bukan direktori
 * publik, jadi menampilkan nomor di sini bukan kebocoran baru: siapa pun yang bisa
 * membuka halaman login pribadi ini sudah punya link aplikasinya.
 */
export async function GET() {
  const users = allowedUsers().map((u) => ({ phone: u.phone, label: u.label }));
  return NextResponse.json({ users });
}
