# PRD: FinTrack

Personal finance tracker, PWA installable, local-first, siap dikembangkan jadi AI agent WhatsApp.

- Versi dokumen: 1.0
- Tanggal: 2026-09-01
- Status: draft untuk dieksekusi
- Pemilik: tholush@gmail.com

---

## 1. Ringkasan

FinTrack adalah aplikasi pencatatan keuangan pribadi berbasis web yang bisa di-install
seperti aplikasi native (PWA). Data ditulis dulu ke device (IndexedDB) sehingga input
tetap jalan tanpa internet, lalu disinkronkan ke Postgres di Supabase saat online.
Server jadi sumber kebenaran bersama, dan itu yang nanti membuat agent WhatsApp bisa
membaca serta menulis data yang sama.

### Tujuan

1. Input transaksi selesai dalam waktu di bawah 10 detik, maksimal 3 ketukan dari layar utama.
2. Aplikasi dapat dibuka dan menerima input penuh dalam kondisi offline.
3. Pengguna tahu jawaban dari tiga pertanyaan setiap saat: sisa uang, ke mana uang pergi,
   dan apakah budget bulan ini masih aman.
4. Arsitektur data siap dipakai agent WhatsApp tanpa migrasi besar.

### Bukan tujuan (MVP)

- Bukan aplikasi akuntansi double entry lengkap.
- Tidak ada koneksi otomatis ke bank atau e-wallet (belum ada open banking yang murah di Indonesia).
- Tidak ada investasi, portofolio saham, atau net worth tracking.
- Tidak ada multi-currency. IDR saja.
- Tidak ada fitur sosial atau kolaborasi real time.
- Google Sheets tidak dipakai sebagai penyimpan transaksi. Alasannya ada di bagian 5.

### Keputusan yang sudah dikunci

| Topik | Keputusan |
|---|---|
| Scope MVP | Transaksi dan kategori, budget dan recurring, report dan analytics |
| Penyimpanan | Local-first: IndexedDB di device, sync ke Postgres Supabase |
| Stack | Next.js + Supabase + Dexie + shadcn/ui + Recharts |
| User | Multi-user sederhana: tiap user punya data sendiri, akses dibatasi allowlist email lewat env |
| Currency | IDR saja, format id-ID |
| Hutang, goal, split bill | Ditunda ke fase 3 |
| Deployment | Vercel untuk aplikasi, Supabase untuk data, keduanya region Singapura |
| Spreadsheet | Lewat impor dan ekspor CSV. Bukan Google Sheets sebagai penyimpan data |

---

## 2. Persona dan user story

### Persona

- **Tholib, 30an, karyawan atau freelancer.** Punya beberapa dompet: rekening bank, cash,
  GoPay, OVO. Sering transaksi kecil dan lupa mencatat. Butuh cepat, bukan lengkap.
- **Pasangan atau anggota keluarga (opsional).** Punya akun sendiri, data terpisah.
  Tidak ada workspace bersama di MVP.

### User story utama

| ID | Sebagai pengguna saya ingin | Supaya |
|---|---|---|
| US-01 | mencatat pengeluaran dalam beberapa detik | tidak malas mencatat |
| US-02 | mencatat walau sedang tidak ada sinyal | catatan tidak hilang di jalan atau di parkiran |
| US-03 | memisahkan uang per dompet dan melihat saldo tiap dompet | tahu uang fisik dan digital saya cocok |
| US-04 | membuat kategori sendiri | sesuai kebiasaan belanja saya |
| US-05 | menetapkan budget bulanan per kategori | tahu kapan harus rem |
| US-06 | transaksi rutin dibuat otomatis | tidak input gaji dan langganan tiap bulan |
| US-07 | melihat ke mana uang pergi bulan ini | bisa memutuskan mau memotong pos apa |
| US-08 | memasang aplikasi di home screen | terasa seperti aplikasi, bukan tab browser |
| US-09 | mengekspor data saya | tidak terkunci di satu aplikasi |
| US-10 | (fase 2) mencatat lewat chat WhatsApp | mencatat di tempat saya sudah mengetik tiap hari |

---

## 3. Scope per fase

### Fase 1: MVP PWA (target 6 sampai 8 minggu part time)

Auth, akun/dompet, transaksi, kategori, budget, recurring, dashboard, report, PWA install,
offline, sync, export CSV.

### Fase 2: WhatsApp AI agent (target 3 sampai 4 minggu setelah MVP stabil)

Webhook WhatsApp Cloud API, parsing bahasa natural jadi transaksi lewat tool calling,
konfirmasi, query saldo dan ringkasan, laporan terjadwal.

### Fase 3: Perluasan

Hutang dan piutang, goal tabungan, split bill, scan struk (OCR), import mutasi CSV bank,
multi-currency, shared household workspace.

---

## 4. Spesifikasi fitur MVP

### F-01 Autentikasi dan multi-user sederhana

- Supabase Auth, metode: magic link email dan Google OAuth.
- Multi-user tanpa panel admin. Kontrol akses lewat environment variable:
  `ALLOWED_EMAILS=a@x.com,b@x.com`. Divalidasi di dua tempat:
  1. Supabase Auth Hook (before user created) menolak email di luar daftar, atau
  2. jika hook tidak dipakai, tabel `allowed_emails` yang di-seed dari env saat deploy,
     dicek oleh trigger `on auth.users insert`.
- Setiap baris data punya `user_id`. Row Level Security wajib aktif di semua tabel.
- Tidak ada sharing data antar user di MVP. Struktur tabel tetap menyiapkan `household_id`
  yang untuk sementara diisi sama dengan `user_id`, supaya fase 3 tidak butuh migrasi besar.

Acceptance:
- User di luar allowlist gagal login dengan pesan jelas, bukan error mentah.
- Query langsung ke Supabase REST memakai token user A tidak pernah mengembalikan baris user B.

### F-02 Akun dan dompet

- Field: nama, tipe (`cash`, `bank`, `ewallet`, `credit_card`), saldo awal, ikon, warna,
  urutan tampil, status arsip.
- Saldo dihitung, bukan disimpan: `saldo = saldo_awal + sum(mutasi)`. Cache boleh, tapi
  hasil hitung adalah sumber kebenaran.
- Transfer antar akun adalah satu transaksi bertipe `transfer` dengan `account_id` dan
  `to_account_id`. Transfer tidak pernah masuk laporan income maupun expense.
- Kartu kredit: saldo negatif berarti utang. Tidak ada perhitungan bunga di MVP.

Acceptance: setelah menambah transfer 100000 dari A ke B, saldo A turun 100000, saldo B
naik 100000, dan total pengeluaran bulan itu tidak berubah.

### F-03 Transaksi

Inti aplikasi. Harus paling cepat dan paling rapi.

- Tipe: `expense`, `income`, `transfer`.
- Field: jumlah, tipe, tanggal dan waktu, akun, kategori, catatan, tag (opsional),
  lampiran foto (opsional, fase 1 boleh ditunda), `merchant` (opsional).
- Input jumlah pakai keypad numerik besar khusus, bukan input teks biasa. Format ribuan
  otomatis saat mengetik. Mendukung ekspresi sederhana seperti `12000+5000`.
- Default cerdas: tanggal hari ini, akun terakhir dipakai, kategori paling sering dipakai
  untuk akun tersebut.
- Daftar transaksi: dikelompokkan per hari, ada subtotal harian, infinite scroll,
  pencarian teks, filter (rentang tanggal, akun, kategori, tipe, rentang jumlah).
- Hapus adalah soft delete (`deleted_at`), wajib untuk sync yang benar.
- Duplikat transaksi dalam satu ketukan.

Acceptance: dari layar utama, mencatat pengeluaran 25000 kategori Makan selesai dalam
3 ketukan dan tetap berhasil dalam mode pesawat.

### F-04 Kategori

- Dua level: kategori induk dan sub kategori. Cukup dua, jangan lebih dalam.
- Bawaan yang di-seed saat pendaftaran, konteks Indonesia:
  Makan dan Minum, Transportasi, Belanja, Tagihan dan Utilitas, Kesehatan, Pendidikan,
  Hiburan, Keluarga, Donasi dan Zakat, Lainnya. Income: Gaji, Bonus, Freelance,
  Hadiah, Lainnya.
- Bisa tambah, ubah, arsip. Menghapus kategori yang masih dipakai tidak diizinkan,
  arahkan ke arsip atau pindahkan transaksinya.
- Setiap kategori punya ikon SVG dan warna. Tidak memakai emoji sebagai ikon.

### F-05 Budget

- Budget bulanan per kategori. Satu baris per kategori per bulan.
- Opsi `rollover`: sisa budget bulan lalu ditambahkan ke bulan ini (gaya envelope).
- Tampilan: progress bar, jumlah terpakai, sisa, dan proyeksi akhir bulan berdasarkan
  laju pengeluaran harian.
- Peringatan pada 80 persen dan 100 persen. Di MVP peringatan tampil di aplikasi.
  Push notification masuk fase 2 karena butuh izin dan Web Push.

Acceptance: mengubah tanggal transaksi ke bulan lain memindahkan konsumsi budget ke
bulan tersebut, tidak menggandakannya.

### F-06 Transaksi berulang (recurring)

- Aturan: harian, mingguan, bulanan (dengan penanganan tanggal 29 sampai 31), tahunan,
  atau custom setiap N hari. Ada tanggal mulai dan tanggal berakhir opsional.
- Dua mode: `auto` (langsung jadi transaksi) dan `reminder` (masuk kotak "menunggu
  konfirmasi" di dashboard).
- Materialisasi dijalankan dua tempat, dan keduanya idempoten:
  1. saat aplikasi dibuka, untuk semua jadwal yang jatuh tempo sampai hari ini,
  2. Supabase cron harian pukul 00:05 Asia/Jakarta untuk user yang tidak membuka aplikasi.
- Idempotensi memakai kunci unik `(recurring_id, occurrence_date)`.

Acceptance: membuka aplikasi lima kali dalam satu hari tidak pernah menghasilkan
transaksi berulang ganda.

### F-07 Dashboard

Satu layar, urutan dari atas:
1. Total saldo semua akun, plus perubahan dibanding bulan lalu.
2. Ringkasan bulan berjalan: pemasukan, pengeluaran, selisih.
3. Budget yang mendekati atau melewati batas.
4. Grafik pengeluaran 30 hari terakhir (bar harian).
5. Lima transaksi terakhir.
6. Tombol aksi mengambang untuk tambah transaksi.

### F-08 Laporan dan analitik

- Pilih periode: bulan ini, bulan lalu, 3 bulan, tahun berjalan, custom.
- Grafik: donat pengeluaran per kategori, garis tren bulanan pemasukan dibanding
  pengeluaran, batang perbandingan antar bulan, arus kas per akun.
- Tabel rincian per kategori dengan persentase dan jumlah transaksi, bisa di-drilldown
  ke daftar transaksi.
- Ekspor CSV untuk periode terpilih. Ekspor PDF ditunda ke fase 3.
- Semua agregasi dihitung dari data lokal supaya laporan tetap terbuka saat offline.

### F-09 PWA dan offline

- Installable: `manifest.webmanifest` lengkap, ikon 192, 512, dan maskable 512,
  `display: standalone`, `start_url: /`, `theme_color`, `background_color`, shortcut
  "Tambah pengeluaran" yang membuka form input langsung.
- Service worker memakai Serwist (penerus next-pwa yang aktif dirawat).
  Strategi cache: app shell precache, halaman `NetworkFirst`, aset statis
  `CacheFirst`, panggilan API tidak di-cache karena data dilayani dari IndexedDB.
- Prompt install kustom: tangkap `beforeinstallprompt`, tampilkan banner halus setelah
  user membuat minimal 3 transaksi. iOS tidak punya event ini, jadi tampilkan instruksi
  "Bagikan lalu Tambahkan ke Layar Utama" untuk Safari.
- Indikator status offline dan jumlah perubahan yang belum tersinkron di header.
- Target Lighthouse: Performance minimal 90, PWA installable lulus, Accessibility minimal 95.

### F-10 Pengaturan

Profil, tema terang dan gelap, hari awal bulan (untuk siklus gaji, misalnya tanggal 25),
kelola kategori, kelola akun, ekspor data (JSON dan CSV), hapus semua data lokal,
keluar akun.

### F-11 Impor dan ekspor CSV

Spreadsheet tetap jadi jalan keluar masuk data, tanpa mengikat aplikasi ke Google API.

- **Ekspor:** satu berkas CSV per rentang tanggal, plus ekspor JSON penuh untuk cadangan.
  Kolom: `id, tanggal, tipe, jumlah, akun, akun_tujuan, kategori, sub_kategori, catatan, tag, sumber`.
  Encoding UTF-8 dengan BOM supaya Excel di Windows tidak merusak huruf beraksen.
  Jumlah ditulis sebagai bilangan bulat tanpa pemisah ribuan, supaya tidak dibaca sebagai teks.
- **Impor:** unggah CSV, lalu pemetaan kolom secara manual (kolom mana jadi tanggal, jumlah,
  dan seterusnya). Pemetaan disimpan sebagai preset agar impor berikutnya dari bank yang
  sama langsung jalan.
- **Pratinjau sebelum menyimpan.** Tampilkan 20 baris pertama hasil pemetaan, tandai baris
  yang bermasalah, dan tampilkan hitungan: sekian baris baru, sekian duplikat, sekian gagal.
- **Deteksi duplikat:** jika kolom `id` ada dan cocok, baris diperlakukan sebagai pembaruan.
  Jika tidak ada `id`, sidik jari `(tanggal, jumlah, akun, catatan)` dipakai untuk menandai
  dugaan duplikat, dan pengguna yang memutuskan.
- **Impor bersifat atomik.** Semua baris masuk atau tidak sama sekali, dan bisa dibatalkan
  lewat satu tombol Urungkan yang menghapus seluruh batch berdasarkan `import_batch_id`.
- Kategori dan akun yang belum ada ditawarkan untuk dibuat, bukan dibuat diam-diam.

Alur ini menutup kebutuhan spreadsheet: ekspor, olah di Excel atau Google Sheets, impor
kembali. Tanpa OAuth, tanpa batas laju Sheets API, tanpa kolom yang diam-diam berubah tipe.

Acceptance: mengekspor lalu langsung mengimpor kembali berkas yang sama menghasilkan nol
baris baru dan nol perubahan saldo.

---

## 5. Standar penanganan data

Hal-hal berikut bukan preferensi, ini aturan yang mencegah bug mahal di aplikasi keuangan.

### Uang

- Simpan sebagai **bigint dalam satuan terkecil** (rupiah bulat, bukan sen, karena sen
  tidak dipakai di praktik sehari-hari Indonesia). Kolom: `amount_minor bigint not null`.
- **Jangan pernah** memakai `float` atau `double`. Pembulatan biner akan merusak total.
- Konversi ke tampilan hanya di lapisan UI:
  `new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 })`.
- Tanda arah disimpan di kolom `type`, bukan di tanda angka. `amount_minor` selalu positif.

### Waktu

- Simpan `occurred_at` sebagai `timestamptz` UTC.
- Simpan juga `occurred_on date` dalam waktu lokal user (Asia/Jakarta) sebagai kolom
  turunan. Semua pengelompokan harian, bulanan, dan budget memakai kolom ini. Ini
  menghindari transaksi jam 23:30 WIB tercatat di hari berikutnya karena UTC.
- `created_at`, `updated_at`, `deleted_at` semuanya `timestamptz` UTC.

### Identitas

- Primary key memakai UUID v7 yang dibuat di klien. Klien harus bisa membuat baris saat
  offline, jadi ID tidak boleh berasal dari server. UUID v7 terurut menurut waktu sehingga
  indeks tetap efisien.

### Penghapusan

- Soft delete di semua tabel yang disinkronkan. Hard delete membuat baris yang dihapus
  saat offline hidup lagi setelah sync.

### Kenapa bukan Google Sheets sebagai penyimpan transaksi

Pertimbangan ini dicatat supaya tidak dibahas ulang di kemudian hari.

| Masalah | Akibat di aplikasi keuangan |
|---|---|
| Batas laju Sheets API: 60 baca per menit per user, 300 per menit per project | Satu layar laporan bisa memicu banyak baca dan aplikasi berhenti melayani |
| Latensi 300 sampai 800 ms per panggilan, dibanding sekitar 20 ms di Postgres | Sync jadi lambat, dan tiap fungsi Vercel menambah cold start di atasnya |
| Tidak ada transaksi atomik | Transfer antar akun butuh dua mutasi konsisten. Gagal di tengah berarti uang menguap di laporan |
| Tidak ada Row Level Security | Multi-user berarti satu sheet per user dan pengaturan izin manual |
| Tipe data ditebak otomatis | Angka berubah jadi teks, teks berubah jadi tanggal, tanpa peringatan |
| Tidak ada indeks | Filter atas puluhan ribu baris harus dikerjakan di sisi aplikasi |

Kebutuhan yang sebenarnya, yaitu memeriksa dan mengoreksi data di spreadsheet, sudah
dipenuhi oleh F-11 lewat ekspor dan impor CSV. Jalur itu memberi hasil yang sama tanpa
satu pun kerugian di tabel di atas.

---

## 6. Model data

### Skema Postgres (Supabase)

```sql
-- semua tabel: RLS aktif, kebijakan berbasis auth.uid()

create table accounts (
  id             uuid primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  household_id   uuid not null,
  name           text not null,
  type           text not null check (type in ('cash','bank','ewallet','credit_card')),
  opening_balance_minor bigint not null default 0,
  icon           text,
  color          text,
  sort_order     int  not null default 0,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table categories (
  id           uuid primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null,
  parent_id    uuid references categories(id),
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

create table transactions (
  id             uuid primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  household_id   uuid not null,
  type           text not null check (type in ('expense','income','transfer')),
  amount_minor   bigint not null check (amount_minor > 0),
  account_id     uuid not null references accounts(id),
  to_account_id  uuid references accounts(id),
  category_id    uuid references categories(id),
  note           text,
  merchant       text,
  tags           text[] not null default '{}',
  occurred_at    timestamptz not null,
  occurred_on    date not null,
  recurring_id   uuid references recurring_rules(id),
  source         text not null default 'app'
                 check (source in ('app','whatsapp','import','recurring')),
  external_ref   text,
  import_batch_id uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint transfer_needs_target
    check (type <> 'transfer' or to_account_id is not null),
  constraint non_transfer_needs_category
    check (type = 'transfer' or category_id is not null)
);

create index on transactions (user_id, occurred_on desc) where deleted_at is null;
create index on transactions (user_id, updated_at);
create index on transactions (user_id, category_id, occurred_on);

create table budgets (
  id            uuid primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  household_id  uuid not null,
  category_id   uuid not null references categories(id),
  period_month  date not null,           -- selalu tanggal 1 bulan tersebut
  amount_minor  bigint not null check (amount_minor >= 0),
  rollover      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (user_id, category_id, period_month)
);

create table recurring_rules (
  id             uuid primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  household_id   uuid not null,
  template       jsonb not null,          -- bentuk transaksi yang akan dibuat
  frequency      text not null check (frequency in ('daily','weekly','monthly','yearly','custom')),
  interval_n     int  not null default 1,
  day_of_month   int,
  day_of_week    int,
  start_on       date not null,
  end_on         date,
  mode           text not null default 'auto' check (mode in ('auto','reminder')),
  last_run_on    date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table recurring_occurrences (
  recurring_id    uuid not null references recurring_rules(id) on delete cascade,
  occurrence_date date not null,
  transaction_id  uuid references transactions(id),
  primary key (recurring_id, occurrence_date)  -- kunci idempotensi
);
```

Contoh kebijakan RLS, diterapkan sama untuk semua tabel:

```sql
alter table transactions enable row level security;

create policy "own rows" on transactions
  for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());
```

### Skema IndexedDB (Dexie)

Cerminan tabel di atas, ditambah dua tabel khusus klien:

```ts
db.version(1).stores({
  accounts:    'id, updated_at, deleted_at',
  categories:  'id, kind, parent_id, updated_at',
  transactions:'id, occurred_on, account_id, category_id, type, updated_at, [type+occurred_on]',
  budgets:     'id, period_month, category_id, updated_at',
  recurring:   'id, start_on, updated_at',
  outbox:      '++seq, entity, entity_id, op, created_at',   // antrean perubahan lokal
  meta:        'key',                                        // cursor sync, device_id
});
```

---

## 7. Arsitektur sync

Yang dibutuhkan adalah antrean tulis yang tersinkron, bukan CRDT. Tidak ada editing
kolaboratif, jadi jangan menambah Yjs atau Automerge.

### Alur tulis

1. UI menulis ke Dexie dalam satu transaksi bersama satu baris `outbox`.
2. UI langsung menampilkan hasilnya. Tidak ada spinner menunggu jaringan.
3. Worker sync mengirim isi outbox ke server saat online, berurutan menurut `seq`.
4. Server membalas dengan baris hasil kanonik, klien menimpanya, lalu menghapus baris outbox.

### Alur baca

Pull inkremental: `GET /api/sync?since=<updated_at cursor>` mengembalikan semua baris yang
berubah termasuk yang bertanda `deleted_at`. Klien menyimpan cursor baru di tabel `meta`.

### Resolusi konflik

Last write wins per baris, memakai `updated_at` dari server. Alasannya: satu pengguna
dengan beberapa device, konflik nyata sangat jarang. Aturannya:

- Server memenangkan baris jika `server.updated_at > client.base_updated_at`.
- Klien tetap menampilkan pesan halus "1 perubahan ditimpa versi terbaru" agar tidak senyap.
- Transaksi yang identik dari dua device dicegah oleh UUID klien, bukan oleh pencocokan isi.

### Kenapa bukan PowerSync atau ElectricSQL

Keduanya bagus, tapi menambah layanan dan biaya untuk masalah yang di sini masih kecil:
satu user, tabel sedikit, konflik hampir tidak ada. Dexie plus outbox buatan sendiri
cukup dan tidak mengunci ke vendor. Jika nanti data melewati sekitar 100 ribu baris atau
ada banyak device aktif bersamaan, PowerSync adalah jalur upgrade yang jelas karena
sumber datanya tetap Postgres yang sama.

---

## 8. Kontrak API

Semua endpoint memakai Next.js Route Handlers dan memverifikasi JWT Supabase.

| Method | Path | Kegunaan |
|---|---|---|
| GET | `/api/sync?since=<iso>` | Tarik perubahan sejak cursor. Balasan berisi `changes` per entitas dan `cursor` baru |
| POST | `/api/sync` | Kirim batch outbox. Body: array `{entity, op, id, payload, base_updated_at}` |
| POST | `/api/recurring/run` | Materialisasi jadwal jatuh tempo. Idempoten. Dipanggil klien dan cron |
| GET | `/api/export?format=csv&from=&to=` | Ekspor CSV atau JSON |
| POST | `/api/import` | Impor CSV yang sudah dipetakan. Atomik, mengembalikan `import_batch_id` |
| DELETE | `/api/import/:batchId` | Urungkan satu batch impor |
| POST | `/api/wa/webhook` | Fase 2. Webhook WhatsApp Cloud API |

Aturan tetap:
- Setiap permintaan tulis membawa `Idempotency-Key`. Kirim ulang tidak menggandakan data.
- Balasan error memakai bentuk `{ error: { code, message } }` dengan kode yang stabil.
- Batas ukuran batch: 500 baris per permintaan.

---

## 9. Stack dan struktur repositori

### Stack

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | Satu repo untuk UI, API route, dan webhook WhatsApp nanti |
| UI | Tailwind CSS + shadcn/ui | Komponen dimiliki sendiri di dalam repo, bebas dikutak-katik |
| Ikon | lucide-react (SVG inline) | Bukan emoji, mewarisi `currentColor` |
| Grafik | Recharts | Cukup untuk donat, garis, batang, dan ringan |
| State server | TanStack Query | Cache, retry, status offline |
| DB lokal | Dexie 4 + dexie-react-hooks | `useLiveQuery` membuat UI otomatis ikut berubah |
| Backend | Supabase: Postgres, Auth, Cron, Storage | Cepat dipasang, RLS matang, gratis di awal |
| Service worker | Serwist | Penerus next-pwa yang masih dirawat |
| Validasi | Zod, dipakai bersama oleh form, API, dan tool WhatsApp | Satu definisi bentuk data |
| Test | Vitest, Playwright | Unit dan alur end to end termasuk skenario offline |

### Struktur direktori

```
src/
  app/
    (auth)/login/
    (app)/dashboard/  transactions/  budgets/  reports/  settings/
    api/sync/route.ts
    api/recurring/run/route.ts
    api/wa/webhook/route.ts      # fase 2
  components/ui/                 # shadcn
  components/                    # komponen domain
  lib/
    db/           dexie.ts  schema.ts  queries.ts
    sync/         outbox.ts  push.ts  pull.ts  reconcile.ts
    money/        format.ts  parse.ts        # semua matematika uang di sini
    domain/       transactions.ts  budgets.ts  recurring.ts
    supabase/     client.ts  server.ts
  workers/sw.ts
supabase/migrations/
```

Aturan penting: seluruh aritmetika uang hidup di `lib/money`. Komponen tidak boleh
menghitung angka rupiah sendiri.

### Environment

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ALLOWED_EMAILS=tholush@gmail.com,pasangan@example.com
APP_TIMEZONE=Asia/Jakarta
# fase 2
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
ANTHROPIC_API_KEY=
```

### Deployment

Target: Vercel untuk aplikasi, Supabase untuk data. Pembagian tugasnya jelas, dan tidak ada
komponen yang perlu di-hosting sendiri.

| Bagian | Tempat | Catatan |
|---|---|---|
| Next.js, API route, webhook | Vercel | Region `sin1` (Singapura), paling dekat ke Indonesia |
| Postgres, Auth, Storage | Supabase | Pilih region Singapura juga, supaya latensi antar keduanya kecil |
| Pekerjaan terjadwal | Supabase `pg_cron` | Lebih andal daripada Vercel Cron untuk tier gratis, dan berjalan di dekat data |
| Berkas statis dan service worker | Vercel CDN | Otomatis |

Hal yang perlu diperhatikan di lingkungan serverless Vercel:

- **Jangan menyimpan state di memori fungsi.** Tiap permintaan bisa mendarat di instans
  berbeda. Antrean sync hidup di IndexedDB klien, bukan di server.
- **Batas waktu eksekusi.** Fungsi di paket Hobby dibatasi sekitar 10 detik, Pro lebih
  panjang. Impor CSV besar harus dipecah menjadi batch 500 baris dari sisi klien, bukan
  satu permintaan raksasa.
- **Pakai koneksi pooling Supabase** (port 6543, mode transaction), bukan koneksi langsung.
  Fungsi serverless membuka banyak koneksi pendek dan akan menghabiskan kuota koneksi
  Postgres jika memakai port 5432.
- **Service worker harus disajikan dari root** dengan header `Service-Worker-Allowed: /`
  dan `Cache-Control: no-cache`, supaya versi baru langsung terdeteksi.
- **Preview deployment punya URL berbeda tiap commit.** Daftarkan pola URL itu di daftar
  redirect Supabase Auth, kalau tidak login di preview akan gagal.
- **Header keamanan** diatur di `next.config.mjs`: CSP, `Strict-Transport-Security`,
  `X-Content-Type-Options`, `Referrer-Policy`.

Alur rilis: push ke branch membuat preview, merge ke `main` membuat production. Migrasi
database dijalankan lewat Supabase CLI di GitHub Actions sebelum deploy, bukan dari
runtime aplikasi.

---

## 10. Referensi open source

Dipilih dari penelusuran, dengan catatan lisensi. **Ini penting:** repo AGPL tidak boleh
disalin ke aplikasi yang mau ditutup sumbernya. Kalau FinTrack akan tetap privat,
salin kode hanya dari yang berlisensi MIT, dan dari repo AGPL ambil idenya saja.

| Repo | Stars | Lisensi | Yang layak diadopsi |
|---|---|---|---|
| [actualbudget/actual](https://github.com/actualbudget/actual) | 28.5k | MIT | Rujukan utama. Arsitektur local-first, mesin sync, model envelope budgeting, penanganan uang sebagai integer. Aman disalin |
| [mayswind/ezbookkeeping](https://github.com/mayswind/ezbookkeeping) | 5.5k | MIT | Struktur skema akun dan kategori, model transfer, ide laporan. Go, jadi ambil desain datanya |
| [gokulkrishh/expense.fyi](https://github.com/gokulkrishh/expense.fyi) | 759 | AGPL-3.0 | Next.js + Supabase + shadcn, paling mirip stack kita. Pakai sebagai contoh pola, jangan disalin mentah |
| [needim/gider.im-pwa](https://github.com/needim/gider.im-pwa) | 210 | AGPL-3.0 | PWA offline yang matang, pola manifest dan service worker. Rujukan, bukan sumber salinan |
| [firefly-iii/firefly-iii](https://github.com/firefly-iii/firefly-iii) | 24.5k | AGPL-3.0 | Rujukan kelengkapan: mesin aturan kategorisasi otomatis, laporan. Bahan fase 3 |
| [dexie/Dexie.js](https://github.com/dexie/Dexie.js) | - | Apache-2.0 | Dipakai langsung sebagai dependensi |

Yang benar-benar bisa disalin sekarang: komponen shadcn/ui (MIT), pola sync dan uang
dari Actual (MIT), dan modul Serwist (MIT).

---

## 11. Fase 2: agent WhatsApp

Ditulis sekarang supaya keputusan MVP tidak menutup jalan.

### Arsitektur

```
WhatsApp -> Meta Cloud API -> POST /api/wa/webhook
  -> verifikasi tanda tangan X-Hub-Signature-256
  -> petakan nomor pengirim ke user_id lewat tabel wa_links
  -> Claude dengan tool calling
       tools: create_transaction, query_balance, query_summary,
              list_recent, delete_transaction, set_budget
  -> jalankan tool di layer domain yang sama dengan aplikasi web
  -> balas ringkasan ke WhatsApp
```

### Keputusan yang sudah bisa dikunci

- **Pakai WhatsApp Cloud API resmi, bukan Baileys.** Baileys memakai jalur WhatsApp Web
  yang tidak resmi dan berisiko nomor diblokir. Percakapan yang dimulai pengguna
  (service conversation) punya kuota gratis bulanan dari Meta, dan pemakaian pribadi
  jauh di bawah kuota itu. Verifikasi angka terbaru di dokumentasi Meta saat implementasi.
- **Menautkan nomor:** tabel `wa_links (phone_e164, user_id, verified_at)`. Verifikasi
  sekali lewat kode 6 digit yang ditampilkan di halaman pengaturan aplikasi.
- **Nomor tak dikenal diabaikan.** Jangan pernah membalas nomor yang tidak tertaut.
- **Semua penulisan lewat tool, bukan lewat teks bebas.** Model mengeluarkan argumen
  tool yang divalidasi Zod, memakai skema yang persis sama dengan form web.
- **Konfirmasi untuk yang meragukan.** Jika jumlah atau kategori berkeyakinan rendah,
  balas dengan tombol konfirmasi terlebih dahulu. Penghapusan selalu dikonfirmasi.
- **Idempotensi:** `external_ref` diisi message id WhatsApp. Webhook Meta melakukan
  pengiriman ulang, dan tanpa ini transaksi akan tercatat dua kali.
- **Transaksi dari WhatsApp diberi `source='whatsapp'`** supaya bisa diaudit dan difilter.

Contoh alur: "tadi makan siang 35rb pake gopay" menjadi
`create_transaction(type=expense, amount_minor=35000, category='Makan dan Minum',
account='GoPay', occurred_at=now)` lalu balasan
"Tercatat: Rp35.000 Makan dan Minum dari GoPay. Sisa budget makan bulan ini Rp420.000."

Model: pakai keluarga Claude terbaru, `claude-sonnet-5` untuk percakapan sehari-hari
karena murah dan cepat, `claude-opus-5` bila butuh penalaran laporan yang lebih berat.

---

## 12. Kebutuhan non fungsional

### Performa

| Metrik | Target |
|---|---|
| First Contentful Paint di 4G | di bawah 1.5 detik |
| Time to Interactive | di bawah 3 detik |
| Buka form input sampai siap diketik | di bawah 200 ms |
| Simpan transaksi (lokal) | di bawah 50 ms |
| Ukuran bundle rute utama | di bawah 200 KB terkompresi |
| Daftar 10 ribu transaksi | tetap 60 fps, wajib virtualisasi |

### Keamanan

- RLS aktif di semua tabel, diuji dengan tes otomatis yang mencoba akses lintas user.
- `SUPABASE_SERVICE_ROLE_KEY` hanya di server, tidak pernah diberi awalan `NEXT_PUBLIC_`.
- Webhook WhatsApp memverifikasi HMAC `X-Hub-Signature-256` sebelum memproses apa pun.
- Content Security Policy ketat, tanpa `unsafe-inline` untuk skrip.
- Data di IndexedDB tidak terenkripsi. Ini konsekuensi yang disadari. Kalau device dibagi
  dengan orang lain, tambahkan kunci PIN di fase 3.
- Rate limit di semua route API, terutama webhook.

### Aksesibilitas

- Kontras minimal WCAG AA. Target sentuh minimal 44 x 44 px.
- Tombol berikon wajib punya `aria-label` dan `title`.
- Form bisa dioperasikan penuh dengan keyboard, fokus terlihat jelas.
- Jangan mengandalkan warna saja untuk status budget, sertakan angka dan label.

### Kualitas dan pengujian

- Unit test wajib untuk `lib/money`, `lib/domain`, dan `lib/sync/reconcile`. Ini bagian
  yang kalau salah akan menghasilkan angka salah tanpa terlihat.
- Playwright untuk tiga alur: tambah transaksi offline lalu sync, budget menghitung ulang
  saat tanggal transaksi berubah, dan recurring tidak menggandakan diri.
- Pemeriksaan ASCII pada semua berkas sebelum commit, sesuai aturan proyek.

---

## 13. Rencana kerja

| Milestone | Isi | Perkiraan |
|---|---|---|
| M0 Fondasi | Repo, Next.js, Tailwind, shadcn, Supabase, migrasi, RLS, login, allowlist | 1 minggu |
| M1 Data lokal | Dexie, skema, outbox, `lib/money`, seed kategori dan akun | 1 minggu |
| M2 Transaksi | CRUD, keypad angka, daftar, filter, pencarian, transfer | 1.5 minggu |
| M3 Sync | Push, pull, cursor, resolusi konflik, indikator status | 1 minggu |
| M4 Budget dan recurring | Budget, rollover, mesin jadwal, idempotensi, cron | 1 minggu |
| M5 Laporan | Dashboard, grafik, drilldown, ekspor CSV, impor CSV | 1.5 minggu |
| M6 PWA dan rilis | Manifest, service worker, prompt install, audit Lighthouse, deploy | 0.5 minggu |
| M7 WhatsApp | Webhook, penautan nomor, tool calling, konfirmasi | 3 sampai 4 minggu |

### Definisi selesai untuk MVP

1. Bisa di-install di Android dan iOS, ikonnya muncul di home screen.
2. Mode pesawat: buka aplikasi, tambah 5 transaksi, tutup, buka lagi, data masih ada.
   Setelah online, kelima transaksi muncul di device kedua.
3. Saldo tiap akun sama dengan hitungan manual dari daftar transaksi.
4. Skor Lighthouse memenuhi target di bagian performa.
5. Tes RLS membuktikan user B tidak pernah bisa membaca data user A.
6. Ekspor CSV bisa dibuka di spreadsheet dengan angka yang benar, dan berkas hasil ekspor
   itu bisa diimpor kembali tanpa menghasilkan duplikat.

---

## 14. Risiko

| Risiko | Dampak | Penanganan |
|---|---|---|
| Sync buatan sendiri punya kasus tepi yang halus | Data hilang atau ganda | Soft delete, UUID klien, tes reconcile, log outbox yang bisa diperiksa |
| iOS membatasi PWA (kuota storage, tidak ada prompt install) | Pengalaman pasang lebih repot | Instruksi pasang khusus Safari, jaga data lokal tetap kecil, sync sering |
| Pengguna berhenti mencatat setelah dua minggu | Produk tidak terpakai | Input harus sangat cepat, recurring mengurangi kerja manual, WhatsApp di fase 2 menutup celah ini |
| Biaya dan verifikasi WhatsApp Business | Fase 2 tertunda | Mulai proses verifikasi Meta lebih awal, saat MVP masih dikerjakan |
| Menyalin kode AGPL ke aplikasi tertutup | Masalah lisensi | Salin hanya dari sumber MIT, catat asal setiap potongan kode |
