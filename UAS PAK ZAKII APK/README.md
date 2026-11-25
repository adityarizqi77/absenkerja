## Menjalankan (versi Supabase)

1. Buat project di Supabase, lalu jalankan seluruh isi `schema.sql` di SQL Editor.
2. Ikuti "LANGKAH MANUAL" di bagian bawah `schema.sql` (buat akun admin dan akun karyawan di Authentication > Users).
3. Isi `SUPABASE_URL` dan `SUPABASE_KEY` (publishable key) di `db.js`.
4. Jalankan lewat server lokal (Live Server atau `npx serve`), bukan dengan membuka file langsung.
5. Masuk dengan email dan kata sandi akun yang dibuat di langkah 2.

Perubahan dari versi demo: data tidak lagi di `localStorage` melainkan di Postgres Supabase; login memakai Supabase Auth (email); jam absen diambil dari server; hak akses dijaga RLS; koreksi dan audit dicatat atomik oleh fungsi SQL. `calc.js` dan tampilan tidak berubah.

## Fitur dan aturan upah (tidak berubah)

- Dashboard sesuai peran karyawan atau Admin/HR.
- Absen masuk/pulang dan larangan pencatatan ganda per tanggal.
- Perhitungan upah: upah normal Rp100.000; jam kerja normal 08.00–16.00; potongan keterlambatan Rp3.125 per blok 15 menit (dibulatkan ke atas); lembur Rp3.125 per blok 15 menit penuh setelah pukul 16.00.
- Riwayat karyawan, pengelolaan data karyawan, koreksi jam dengan alasan dan catatan audit.
- Filter divisi, rekap 30 hari terakhir (hari hadir, total kerja, total lembur, total upah), unduh CSV yang dapat dibuka di aplikasi spreadsheet, dan cetak.
- Dashboard karyawan menampilkan divisi dan ringkasan 30 hari terakhir.

## Pembaruan

- **Jam hidup** di dashboard karyawan kini berjalan tiap detik.
- **Koreksi** kini bisa mengubah status dan mengosongkan jam pulang (mis. lupa absen pulang). Setiap perubahan disimpan sebagai **riwayat audit** (waktu, pelaku, alasan, nilai sebelum/sesudah) dan ditampilkan di form koreksi.
- **Absensi manual** oleh Admin/HR (tombol "+ Tambah absensi" di halaman Absensi), satu catatan per karyawan per tanggal.
- **Status** Hadir, Izin, Sakit, Cuti, dan Alpha. Selain Hadir, upah dihitung Rp0 dan tidak dihitung sebagai hari hadir.
- **Pengaturan aturan upah** (menu Pengaturan): jam masuk, jam selesai, upah normal, dan tarif per 15 menit, dengan validasi.
- **Unit test** perhitungan upah: jalankan `node --test` (Node 18+). Logika hitung ada di `calc.js`.
- Perbaikan bug: tombol Simpan pada form koreksi/karyawan sebelumnya tidak bekerja karena `form.id` tertimpa input bernama `id`.

