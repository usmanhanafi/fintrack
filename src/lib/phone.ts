/**
 * Menormalkan nomor Indonesia ke format E.164.
 * "08123456789", "8123456789", "+62 812-3456-789" semuanya jadi "+628123456789".
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;

  let national: string;
  if (digits.startsWith("+62")) national = digits.slice(3);
  else if (digits.startsWith("62")) national = digits.slice(2);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else national = digits.replace(/^\+/, "");

  if (!/^\d{8,13}$/.test(national)) return null;
  return `+62${national}`;
}

export function formatPhone(e164: string): string {
  const n = e164.replace("+62", "0");
  return n.replace(/(\d{4})(\d{4})(\d+)/, "$1-$2-$3");
}
