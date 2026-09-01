// Waktu lokal pengguna adalah Asia/Jakarta. occurred_at disimpan UTC,
// occurred_on disimpan sebagai tanggal lokal supaya pengelompokan harian tidak geser.

export const APP_TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Jakarta";

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-09-01" menurut zona waktu aplikasi. */
export function localDay(d: Date | string = new Date()): string {
  return dateFmt.format(typeof d === "string" ? new Date(d) : d);
}

/** Tanggal 1 bulan berjalan, dipakai sebagai kunci periode budget. */
export function monthKey(day: string = localDay()): string {
  return `${day.slice(0, 7)}-01`;
}

export function addMonths(monthStart: string, n: number): string {
  const [y, m] = monthStart.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function monthRange(monthStart: string): { from: string; to: string } {
  const next = addMonths(monthStart, 1);
  return { from: monthStart, to: prevDay(next) };
}

export function prevDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysInMonth(monthStart: string): number {
  const [y, m] = monthStart.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const monthNames = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function formatMonth(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  return `${monthNames[m - 1]} ${y}`;
}

export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${monthNames[m - 1]} ${y}`;
}

/** "Hari ini", "Kemarin", atau tanggal lengkap. */
export function formatDayRelative(day: string): string {
  const today = localDay();
  if (day === today) return "Hari ini";
  if (day === prevDay(today)) return "Kemarin";
  return formatDay(day);
}

/** Nilai untuk <input type="datetime-local"> dalam waktu lokal aplikasi. */
export function toLocalInput(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Kebalikan toLocalInput: jam dinding lokal jadi ISO UTC. */
export function fromLocalInput(value: string): string {
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = (timePart || "00:00").split(":").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm);
  // koreksi dua kali menangani tanggal yang jatuh di sekitar pergantian offset
  let offset = tzOffsetMinutes(new Date(utcGuess));
  offset = tzOffsetMinutes(new Date(utcGuess - offset * 60000));
  return new Date(utcGuess - offset * 60000).toISOString();
}

/** Selisih menit zona aplikasi terhadap UTC pada saat tertentu. */
function tzOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const hour = get("hour") === 24 ? 0 : get("hour");
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return Math.round((asUTC - at.getTime()) / 60000);
}
