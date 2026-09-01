import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSessionUserId } from "@/lib/session";
import { ENTITIES, ENTITY_TABLE, SCHEMA, pushSchema, type Entity } from "@/lib/sync/entities";

const PULL_LIMIT = 500;

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Tarik semua baris yang berubah sejak cursor, termasuk yang sudah dihapus. */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured) return fail("not_configured", "Supabase belum disiapkan", 503);
  const userId = await getSessionUserId();
  if (!userId) return fail("unauthorized", "Sesi tidak valid", 401);
  const supabase = createAdminClient();

  const since = request.nextUrl.searchParams.get("since") ?? "1970-01-01T00:00:00Z";
  const changes: Record<string, unknown[]> = {};
  let cursor: string | null = null;
  let hasMore = false;

  for (const entity of ENTITIES) {
    const { data, error } = await supabase
      .from(ENTITY_TABLE[entity])
      .select("*")
      .eq("user_id", userId)
      .gt("updated_at", since)
      .order("updated_at", { ascending: true })
      .limit(PULL_LIMIT);

    if (error) return fail("pull_failed", error.message, 500);

    const rows = (data ?? []).map(stripServerOnly);
    changes[entity] = rows;
    if (rows.length === PULL_LIMIT) hasMore = true;

    for (const row of data ?? []) {
      const at = (row as { updated_at: string }).updated_at;
      if (!cursor || at > cursor) cursor = at;
    }
  }

  // Saat masih ada sisa, cursor harus yang paling kecil di antara batch yang penuh,
  // supaya tarikan berikutnya tidak melompati baris.
  if (hasMore) {
    let safest: string | null = null;
    for (const entity of ENTITIES) {
      const rows = changes[entity] as Array<{ updated_at: string }>;
      if (rows.length === PULL_LIMIT) {
        const last = rows[rows.length - 1].updated_at;
        if (!safest || last < safest) safest = last;
      }
    }
    cursor = safest ?? cursor;
  }

  return NextResponse.json({ changes, cursor, has_more: hasMore });
}

/** Terapkan batch perubahan dari klien. Last write wins, server yang memutuskan. */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured) return fail("not_configured", "Supabase belum disiapkan", 503);
  const userId = await getSessionUserId();
  if (!userId) return fail("unauthorized", "Sesi tidak valid", 401);
  const supabase = createAdminClient();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("bad_json", "Body bukan JSON yang valid", 400);
  }

  const parsed = pushSchema.safeParse(body);
  if (!parsed.success) {
    return fail("invalid_body", parsed.error.issues[0]?.message ?? "Body tidak valid", 400);
  }

  const applied: Array<{ entity: Entity; row: Record<string, unknown> }> = [];
  const rejected: Array<{ id: string; reason: string }> = [];
  let overwritten = 0;

  for (const change of parsed.data.changes) {
    const schema = SCHEMA[change.entity];
    const shaped = schema.safeParse({ ...change.payload, id: change.id });
    if (!shaped.success) {
      rejected.push({ id: change.id, reason: shaped.error.issues[0]?.message ?? "tidak valid" });
      continue;
    }

    const table = ENTITY_TABLE[change.entity];

    // eq("user_id", userId) di sini bukan cuma pemeriksaan, tapi juga penjaga:
    // baris milik user lain tidak akan pernah cocok, jadi update lintas akun mustahil.
    const { data: existing } = await supabase
      .from(table)
      .select("updated_at")
      .eq("id", change.id)
      .eq("user_id", userId)
      .maybeSingle();

    // Versi server lebih baru daripada yang jadi dasar perubahan klien: server menang.
    if (existing && change.base_updated_at && existing.updated_at > change.base_updated_at) {
      const { data: serverRow } = await supabase
        .from(table)
        .select("*")
        .eq("id", change.id)
        .eq("user_id", userId)
        .single();
      if (serverRow) {
        overwritten += 1;
        applied.push({ entity: change.entity, row: stripServerOnly(serverRow) });
        continue;
      }
    }

    const row = {
      ...shaped.data,
      deleted_at: change.op === "delete" ? new Date().toISOString() : shaped.data.deleted_at ?? null,
      user_id: userId,
      household_id: userId,
    };

    const { data: saved, error } = await supabase
      .from(table)
      .upsert(row as never, { onConflict: "id" })
      .select("*")
      .single();

    if (error) {
      rejected.push({ id: change.id, reason: error.message });
      continue;
    }
    applied.push({ entity: change.entity, row: stripServerOnly(saved) });
  }

  return NextResponse.json({ applied, rejected, overwritten });
}

/** Kolom yang hanya relevan di server tidak perlu dibawa ke IndexedDB. */
function stripServerOnly(row: Record<string, unknown>) {
  const { user_id: _user, household_id: _household, ...rest } = row;
  void _user;
  void _household;
  return rest;
}
