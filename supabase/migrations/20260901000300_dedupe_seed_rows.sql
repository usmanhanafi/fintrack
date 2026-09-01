-- Membersihkan akun dan kategori bawaan yang berganda akibat race seed lintas
-- perangkat (setiap perangkat baru sempat mengira datanya kosong sebelum
-- pull pertama selesai, lalu ikut membuat set bawaan lagi).
--
-- Strategi: per (user_id, name, type/kind) pilih satu baris survivor (yang
-- paling lama created_at), pindahkan semua referensi dari baris duplikat ke
-- survivor, lalu soft-delete duplikatnya. Tidak ada hard delete supaya bisa
-- diperiksa ulang atau dipulihkan bila perlu.

do $$
declare
  dup record;
  survivor_id uuid;
begin
  -- ---------------------------------------------------------------- accounts
  for dup in
    select user_id, name, type, (array_agg(id order by created_at asc))[1] as keep_id,
           array_remove(array_agg(id order by created_at asc), (array_agg(id order by created_at asc))[1]) as drop_ids
    from public.accounts
    where deleted_at is null
    group by user_id, name, type
    having count(*) > 1
  loop
    survivor_id := dup.keep_id;

    update public.transactions
      set account_id = survivor_id
      where account_id = any(dup.drop_ids);

    update public.transactions
      set to_account_id = survivor_id
      where to_account_id = any(dup.drop_ids);

    update public.accounts
      set deleted_at = now()
      where id = any(dup.drop_ids);
  end loop;

  -- ------------------------------------------------------------- categories
  for dup in
    select user_id, name, kind, (array_agg(id order by created_at asc))[1] as keep_id,
           array_remove(array_agg(id order by created_at asc), (array_agg(id order by created_at asc))[1]) as drop_ids
    from public.categories
    where deleted_at is null
    group by user_id, name, kind
    having count(*) > 1
  loop
    survivor_id := dup.keep_id;

    update public.transactions
      set category_id = survivor_id
      where category_id = any(dup.drop_ids);

    update public.budgets
      set category_id = survivor_id
      where category_id = any(dup.drop_ids);

    update public.categories
      set deleted_at = now()
      where id = any(dup.drop_ids);
  end loop;
end $$;
