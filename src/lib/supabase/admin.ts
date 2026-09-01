import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/**
 * Login sekarang bukan lewat Supabase Auth (PIN + allowlist env, bukan OTP), jadi tidak
 * ada auth.uid() untuk RLS mengait. Service role dipakai di sini, dan setiap query WAJIB
 * memfilter user_id sendiri dari sesi cookie. Kunci ini tidak boleh sampai ke klien.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diisi di env");
  return createSupabaseClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
