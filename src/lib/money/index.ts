// Semua aritmetika uang hidup di sini. Komponen tidak boleh menghitung rupiah sendiri.
// Uang disimpan sebagai bilangan bulat rupiah (minor unit). Tidak pernah float.

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const plain = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export function formatMoney(minor: number): string {
  return idr.format(Math.trunc(minor));
}

export function formatNumber(minor: number): string {
  return plain.format(Math.trunc(minor));
}

/** Ringkas untuk grafik: 1.2jt, 350rb */
export function formatCompact(minor: number): string {
  const n = Math.abs(minor);
  const sign = minor < 0 ? "-" : "";
  if (n >= 1_000_000_000) return `${sign}${(n / 1_000_000_000).toFixed(1)}m`;
  if (n >= 1_000_000) return `${sign}${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}jt`;
  if (n >= 1_000) return `${sign}${Math.round(n / 1_000)}rb`;
  return `${sign}${n}`;
}

/**
 * Parse input pengguna jadi rupiah bulat.
 * Menerima "12.500", "12500", "12,5rb", "12k", dan ekspresi "12000+5000".
 * Mengembalikan null jika tidak valid.
 */
export function parseMoney(input: string): number | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  // ekspresi penjumlahan atau pengurangan sederhana
  if (/[+\-]/.test(raw.slice(1))) {
    const parts = raw.match(/[+-]?[^+-]+/g);
    if (!parts) return null;
    let total = 0;
    for (const part of parts) {
      const sign = part.startsWith("-") ? -1 : 1;
      const value = parseSingle(part.replace(/^[+-]/, ""));
      if (value === null) return null;
      total += sign * value;
    }
    return Math.trunc(total);
  }
  return parseSingle(raw);
}

function parseSingle(token: string): number | null {
  let s = token.trim().replace(/\s|rp/g, "");
  if (!s) return null;

  let multiplier = 1;
  if (/(rb|ribu|k)$/.test(s)) {
    multiplier = 1_000;
    s = s.replace(/(rb|ribu|k)$/, "");
  } else if (/(jt|juta|m)$/.test(s)) {
    multiplier = 1_000_000;
    s = s.replace(/(jt|juta|m)$/, "");
  }

  // titik adalah pemisah ribuan di id-ID, koma adalah desimal
  s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;

  const value = Number(s) * multiplier;
  if (!Number.isFinite(value)) return null;
  return Math.trunc(value);
}

/** Arah mutasi sebuah transaksi terhadap satu akun. */
export function signedFor(
  tx: { type: string; amount_minor: number; account_id: string; to_account_id?: string | null },
  accountId: string,
): number {
  if (tx.type === "income") return tx.account_id === accountId ? tx.amount_minor : 0;
  if (tx.type === "expense") return tx.account_id === accountId ? -tx.amount_minor : 0;
  if (tx.account_id === accountId) return -tx.amount_minor;
  if (tx.to_account_id === accountId) return tx.amount_minor;
  return 0;
}
