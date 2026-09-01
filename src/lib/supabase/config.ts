/**
 * Aplikasi tetap berguna sebelum Supabase disiapkan: semua data hidup di perangkat,
 * autentikasi dan sync dimatikan. Begitu env terisi, mode online menyala sendiri.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
