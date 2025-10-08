# Galeri SVG (Netlify + Google Drive + Google Apps Script)

Proyek ini menampilkan galeri gambar **SVG** yang disimpan di **Google Drive**, dengan pilihan unduhan **PNG** dalam tiga ukuran (720/1080/1920 px) langsung di browser (client-side), serta **counter unduhan** menggunakan **Google Apps Script**.

## Fitur
- ✅ Hosting statis (cocok untuk Netlify)
- ✅ Sumber file di Google Drive (folder publik)
- ✅ Konversi SVG → PNG di browser (Canvas)
- ✅ Opsi ukuran unduhan: 720, 1080, 1920 px
- ✅ Counter unduhan (disimpan di Google Sheet)

---

## 1) Siapkan Google Drive
1. Buat folder untuk SVG dan **set ke Anyone with the link – Viewer**.
2. Catat **Folder ID** (lihat URL setelah `/folders/`).

## 2) Buat Google Spreadsheet (untuk counter)
1. Buat Spreadsheet baru.
2. Salin **Spreadsheet ID** (di URL antara `/d/` dan `/edit`).

## 3) Buat Google Apps Script (Web App)
1. Buka https://script.google.com/ → **New project**.
2. Buat file kode dan tempelkan isi `apps_script_code.gs` dari repo ini.
3. Ganti nilai `FOLDER_ID` dan `SHEET_ID` sesuai milik Anda.
4. Deploy → **New deployment** → **Web App** → **Anyone** → salin URL Web App.

> Jika mengubah kode Apps Script, redeploy Web App lalu gunakan URL terbaru.

## 4) Konfigurasi Frontend
1. Buka `script.js` → ganti `API_URL` dengan URL Web App dari langkah 3.
2. (Opsional) Edit teks/tema di `index.html` dan `style.css`.

## 5) Deploy ke Netlify
- Drag & drop folder proyek ini (atau ZIP) ke https://app.netlify.com/drop
- Selesai! Dapat URL publik otomatis.

---

## Catatan Teknis
- **CORS & SVG**: Pengambilan SVG dilakukan melalui endpoint `action=raw` pada Apps Script yang mengirim header CORS, lalu dirender ke `<canvas>` via Blob URL agar aman.
- **Counter**: Tombol unduh memanggil `action=hit` (increment tanpa redirect). Badge di UI diupdate secara optimistik.
- **Thumbnail**: Menggunakan `lh3.googleusercontent.com` agar cepat. Tidak digunakan untuk render canvas.
- **Privasi**: Counter versi dasar menghitung total klik (tanpa deduplikasi IP). Anda bisa menambahkan deduplikasi bila perlu.

## Masalah Umum
- **File tidak muncul**: pastikan folder Drive dan file **tidak di-trashed** dan dapat diakses publik.
- **CORS error**: gunakan endpoint `action=raw` dari Apps Script (jangan langsung fetch `uc?export=download`).
- **Unduhan salah ukuran**: pastikan SVG memiliki `viewBox` yang benar.

## Lisensi
Bebas dipakai dan dimodifikasi.
