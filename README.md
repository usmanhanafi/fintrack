# FinTrack

Pencatat keuangan pribadi berbentuk PWA. Data ditulis lebih dulu ke perangkat, jadi
input tetap jalan tanpa internet, lalu disinkronkan ke Postgres saat koneksi ada.

Spesifikasi lengkap ada di [docs/PRD.md](docs/PRD.md).

## Jalankan secara lokal

```bash
npm install
npm run dev
```

Buka http://localhost:3000. Tanpa env Supabase aplikasi berjalan dalam **mode lokal**:
semua fitur pencatatan hidup, data hanya tersimpan di browser, dan halaman masuk dilewati.

## Menyalakan akun dan sinkronisasi

1. Buat project di Supabase, lalu salin `.env.example` menjadi `.env.local` dan isi
   `NEXT_PUBLIC_SUPABASE_URL` serta `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Jalankan migrasi:

   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```

3. Nyalakan **Phone Auth** di Supabase, lalu sambungkan penyedia pesan. Untuk kode masuk
   lewat WhatsApp, pakai Twilio dengan kanal WhatsApp. Selama pengembangan, isi bagian
   *Test phone numbers* di pengaturan Supabase Auth supaya bisa masuk tanpa mengirim
   pesan sungguhan.
4. Batasi siapa yang boleh mendaftar dengan mengisi tabel `allowed_phones`:

   ```sql
   insert into public.allowed_phones (phone, label)
   values ('+6281234567890', 'pemilik');
   ```

   Selama tabel itu kosong, pendaftaran terbuka untuk semua nomor.

## Perintah

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi, sekaligus membangun service worker |
| `npm start` | Menjalankan hasil build |
| `npm test` | Uji unit: uang, waktu, nomor telepon |
| `node tests/e2e.mjs` | Uji browser: catat saat offline, muat ulang, budget |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |

Build memakai webpack (`next build --webpack`) karena plugin service worker Serwist belum
mendukung Turbopack yang menjadi bawaan Next 16.

## Aturan yang menjaga angkanya benar

- Uang disimpan sebagai bilangan bulat rupiah. Tidak pernah float. Semua aritmetika ada di
  `src/lib/money`.
- Waktu kejadian disimpan UTC di `occurred_at`, sedangkan `occurred_on` menyimpan tanggal
  menurut Asia/Jakarta. Pengelompokan harian dan budget memakai `occurred_on`, sehingga
  transaksi pukul 23:30 WIB tidak lompat ke hari berikutnya.
- ID dibuat di klien memakai UUID v7, supaya baris bisa lahir saat offline.
- Penghapusan selalu lunak. Menghapus baris secara keras membuatnya hidup lagi setelah sync.
- Saldo tidak pernah disimpan. Saldo dihitung dari mutasi.

## Struktur

```
src/
  app/(app)/         beranda, transaksi, budget, laporan, pengaturan
  app/login/         masuk dengan nomor WhatsApp
  app/api/sync/      tarik dan kirim perubahan
  components/        antarmuka
  lib/db/            Dexie, mutasi lokal, outbox, query turunan
  lib/sync/          mesin sinkronisasi dan skema bersama
  lib/domain/        aturan berulang, impor dan ekspor CSV
supabase/migrations/ skema Postgres, RLS, allowlist nomor
tests/               uji unit dan uji browser
```

```bash
npx supabase link --project-ref jcunrwkybuirtjyjgklk
npx supabase db push
```