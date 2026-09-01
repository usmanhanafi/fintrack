-- FinTrack skema awal.
-- Uang: bigint rupiah bulat, selalu positif. Arah ditentukan kolom type.
-- Waktu: occurred_at UTC, occurred_on tanggal lokal Asia/Jakarta.
-- Identitas: UUID v7 dibuat di klien supaya baris bisa lahir saat offline.
-- Penghapusan: soft delete di semua tabel yang disinkronkan.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- allowlist

create table if not exists public.allowed_phones (
  phone      text primary key,          -- format E.164, contoh +6281234567890
  label      text,
  created_at timestamptz not null default now()
);

alter table public.allowed_phones enable row level security;
-- Tidak ada kebijakan: hanya service role dan trigger SECURITY DEFINER yang boleh melihat.

create or replace function public.enforce_phone_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Daftar kosong berarti pendaftaran terbuka. Isi tabel ini untuk mengunci akses.
  if not exists (select 1 from public.allowed_phones) then
    return new;
  end if;
  if new.phone is null
     or not exists (select 1 from public.allowed_phones a where a.phone = '+' || new.phone
                    or a.phone = new.phone) then
    raise exception 'Nomor ini belum terdaftar' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_phone_allowlist on auth.users;
create trigger enforce_phone_allowlist
  before insert on auth.users
  for each row execute function public.enforce_phone_allowlist();

-- ---------------------------------------------------------------- tabel inti

create table public.accounts (
  id                    uuid primary key,
  user_id               uuid not null references auth.users(id) on delete cascade,
  household_id          uuid not null,
  name                  text not null,
  type                  text not null check (type in ('cash','bank','ewallet','credit_card')),
  opening_balance_minor bigint not null default 0,
  icon                  text,
  color                 text,
  sort_order            int not null default 0,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create table public.categories (
  id           uuid primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null,
  parent_id    uuid references public.categories(id),
  name         text not null,
  kind         text not null check (kind in ('expense','income')),
  icon         text,
  color        text,
  sort_order   int not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table public.recurring_rules (
  id           uuid primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null,
  name         text not null default '',
  template     jsonb not null,
  frequency    text not null check (frequency in ('daily','weekly','monthly','yearly','custom')),
  interval_n   int not null default 1,
  day_of_month int,
  day_of_week  int,
  start_on     date not null,
  end_on       date,
  mode         text not null default 'auto' check (mode in ('auto','reminder')),
  last_run_on  date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table public.transactions (
  id              uuid primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  household_id    uuid not null,
  type            text not null check (type in ('expense','income','transfer')),
  amount_minor    bigint not null check (amount_minor > 0),
  account_id      uuid not null references public.accounts(id),
  to_account_id   uuid references public.accounts(id),
  category_id     uuid references public.categories(id),
  note            text,
  merchant        text,
  tags            text[] not null default '{}',
  occurred_at     timestamptz not null,
  occurred_on     date not null,
  recurring_id    uuid references public.recurring_rules(id),
  source          text not null default 'app'
                  check (source in ('app','whatsapp','import','recurring')),
  external_ref    text,
  import_batch_id uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint transfer_needs_target
    check (type <> 'transfer' or to_account_id is not null),
  constraint transfer_has_no_category
    check (type <> 'transfer' or category_id is null),
  constraint transfer_accounts_differ
    check (type <> 'transfer' or account_id <> to_account_id)
);

create table public.budgets (
  id           uuid primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null,
  category_id  uuid not null references public.categories(id),
  period_month date not null,
  amount_minor bigint not null check (amount_minor >= 0),
  rollover     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (user_id, category_id, period_month)
);

create table public.recurring_occurrences (
  recurring_id    uuid not null references public.recurring_rules(id) on delete cascade,
  occurrence_date date not null,
  user_id         uuid not null references auth.users(id) on delete cascade,
  transaction_id  uuid references public.transactions(id),
  created_at      timestamptz not null default now(),
  primary key (recurring_id, occurrence_date)
);

-- Menautkan nomor WhatsApp ke user. Dipakai fase 2.
create table public.wa_links (
  phone_e164  text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  verify_code text,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- indeks

create index transactions_user_day_idx on public.transactions (user_id, occurred_on desc)
  where deleted_at is null;
create index transactions_sync_idx on public.transactions (user_id, updated_at);
create index transactions_category_idx on public.transactions (user_id, category_id, occurred_on);
create index accounts_sync_idx on public.accounts (user_id, updated_at);
create index categories_sync_idx on public.categories (user_id, updated_at);
create index budgets_sync_idx on public.budgets (user_id, updated_at);
create index recurring_sync_idx on public.recurring_rules (user_id, updated_at);

-- ---------------------------------------------------------------- updated_at

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  -- Server yang menentukan updated_at. Jam klien tidak boleh dipercaya untuk sync.
  new.updated_at := greatest(now(), coalesce(old.updated_at, now()) + interval '1 microsecond');
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','transactions','budgets','recurring_rules'] loop
    execute format(
      'create trigger touch_%1$s before insert or update on public.%1$s
       for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','transactions','budgets',
                           'recurring_rules','recurring_occurrences','wa_links'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy own_rows on public.%I for all
       using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Kunci idempotensi transaksi berulang: satu kejadian per jadwal per tanggal.
create unique index transactions_recurring_once_idx
  on public.transactions (recurring_id, occurred_on)
  where recurring_id is not null;
