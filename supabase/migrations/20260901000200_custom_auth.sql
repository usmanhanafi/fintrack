-- Login berpindah dari Supabase Auth (OTP nomor WA) ke sesi cookie kustom
-- (nomor dipilih dari ALLOWED_PHONES di env, digerbangi PIN, tanpa OTP).
-- Tanpa auth.users, RLS berbasis auth.uid() tidak bisa dipakai lagi: filter
-- per user sekarang dikerjakan oleh setiap API route lewat service role key,
-- yang selalu menyertakan eq("user_id", ...) pada setiap query.
--
-- RLS tetap dinyalakan sebagai jaring kedua, tapi kebijakannya sekarang
-- "hanya service role", supaya kunci anon/publishable tidak bisa membaca
-- ataupun menulis tabel-tabel ini sama sekali walau bocor ke klien.

drop trigger if exists enforce_phone_allowlist on auth.users;
drop function if exists public.enforce_phone_allowlist();
drop table if exists public.allowed_phones;
drop table if exists public.wa_links;

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','transactions','budgets',
                           'recurring_rules','recurring_occurrences'] loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy service_role_only on public.%I for all
       using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')', t);
  end loop;
end $$;

-- Foreign key ke auth.users tidak relevan lagi karena user tidak lagi berasal
-- dari tabel itu. user_id sekarang UUID v5 turunan nomor telepon, ditentukan
-- oleh kode aplikasi (lihat src/lib/session.ts), bukan oleh Supabase Auth.
alter table public.accounts drop constraint if exists accounts_user_id_fkey;
alter table public.categories drop constraint if exists categories_user_id_fkey;
alter table public.transactions drop constraint if exists transactions_user_id_fkey;
alter table public.budgets drop constraint if exists budgets_user_id_fkey;
alter table public.recurring_rules drop constraint if exists recurring_rules_user_id_fkey;
alter table public.recurring_occurrences drop constraint if exists recurring_occurrences_user_id_fkey;
