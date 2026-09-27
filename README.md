# WA Sticker Bot

Bot WhatsApp (Baileys) khusus untuk membuat sticker. Semua fitur non-sticker
(TikTok, Pinterest, ping, groupid, dll) telah dihapus sesuai permintaan.

## Menu yang tersedia

| Command | Alias | Fungsi |
|---|---|---|
| `.s` / `.sticker` | — | **Satu command untuk semua jenis stiker.** Bot otomatis mendeteksi apakah media yang dikirim/di-reply itu gambar, video, atau gif, lalu mengonversinya jadi stiker. Video/gif otomatis dipotong maksimal **10 detik** pertama. |
| `.hapusbg` | `.removebg`, `.bghapus` | Hapus background gambar otomatis (deteksi objek), lalu jadikan stiker transparan. Dipisah dari `.s` karena ini pilihan aksi, bukan sekadar jenis media. |
| `.upscale` | `.hd`, `.perbesar` | Perbesar resolusi & pertajam gambar (lokal, Real-ESRGAN) |
| `.animehd` | `.waifu2x`, `.animeupscale` | Perhalus & perbesar gambar ala-anime (lokal, Real-ESRGAN anime model) |
| `.menu` | `.help`, `.m` | Tampilkan daftar command |

Kirim media langsung dengan caption command di atas, atau **reply** (balas)
media yang sudah ada di chat dengan command tersebut.

## API / model yang dipakai

- **`.upscale`, `.animehd`** → **Real-ESRGAN lokal** (ncnn-vulkan), jalan di
  server sendiri lewat `child_process`, tidak ada request keluar & tidak
  butuh API key. Lihat bagian "Real-ESRGAN lokal" di bawah untuk cara pasang.
- **`.hapusbg`** → masih pakai **[DeepAI](https://deepai.org)** (model
  `background-remover`) — API yang terdaftar di kategori *Machine Learning*
  pada repo [public-apis/public-apis](https://github.com/public-apis/public-apis),
  gratis dipakai dengan API key (daftar gratis, dapat jatah request bulanan
  tanpa biaya). Dipertahankan karena Real-ESRGAN cuma model upscale, tidak
  punya model penghapus background.

Daftar API key gratis di https://deepai.org/dashboard/profile, lalu isi ke
`DEEPAI_API_KEY` di file `.env` (lihat `.env.example`).

## Real-ESRGAN lokal (`.upscale` & `.animehd`)

Fitur ini memanggil binary **`realesrgan-ncnn-vulkan`** (implementasi resmi
[xinntao/Real-ESRGAN-ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan))
lewat `child_process` — lihat `bot/lib/realesrgan.js`. Model bawaan
(`realesrgan-x4plus` untuk `.upscale`, `realesrgan-x4plus-anime` untuk
`.animehd`) sudah dibundel bareng binary-nya, jadi tidak perlu download
model manual.

**Syarat:** binary itu butuh device Vulkan (GPU asli, atau software renderer
seperti Mesa lavapipe kalau tidak ada GPU) dan harus ada di `PATH`.

- **Lokal / VPS (Linux):**
  1. Unduh build ncnn-vulkan Linux dari
     [halaman release](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases),
     ekstrak, lalu taruh binary `realesrgan-ncnn-vulkan` (beserta folder
     `models` di sebelahnya) di suatu folder dan tambahkan ke `PATH`.
  2. Kalau server tidak punya GPU, pasang driver Vulkan software:
     `sudo apt install mesa-vulkan-drivers libvulkan1`.
- **Railway (Nixpacks):** repo ini sudah menyertakan `nixpacks.toml` yang
  menambahkan paket Nix `realesrgan-ncnn-vulkan` dan `mesa` saat build
  (dan mengunci `nodejs_20` secara eksplisit di situ juga, karena
  mendefinisikan `[phases.setup]` sendiri menonaktifkan deteksi Node.js
  otomatis dari Nixpacks), jadi biasanya tidak perlu setup manual tambahan. Karena Railway tidak
  menyediakan GPU, prosesnya jalan lewat software rendering (Mesa) yang
  jauh lebih lambat dari GPU asli, dan pada sebagian container bisa saja
  tetap gagal menemukan device Vulkan — kalau itu terjadi, pesan error dari
  bot akan menyebut soal Vulkan; solusinya jalankan bot di VPS dengan
  driver Vulkan yang jelas, atau kembalikan `.upscale`/`.animehd` ke DeepAI.

Variabel opsional di `.env` (lihat `.env.example`): `REALESRGAN_BIN`,
`REALESRGAN_MODEL`, `REALESRGAN_ANIME_MODEL`, `REALESRGAN_TIMEOUT_MS`.

## Hapus background (deteksi objek)

Fitur `.hapusbg` memakai model `background-remover` dari DeepAI (lihat bagian
"API / model yang dipakai" di atas) untuk deteksi objek otomatis, lalu
hasilnya dibungkus jadi stiker WebP transparan oleh bot.


## Menjalankan

```bash
cp .env.example .env   # isi sesuai kebutuhan
npm install
npm start
```

Scan QR / pakai pairing code di `http://localhost:<PORT>` (login dulu dengan
`ADMIN_EMAIL` / `ADMIN_PASSWORD` dari `.env`).

## Deploy ke Railway tanpa perlu hubungkan ulang WhatsApp setiap redeploy

Sesi WhatsApp (hasil scan QR / pairing) disimpan bot ke folder di disk
(`auth_info/`). Masalahnya, **disk container Railway itu sementara** — setiap
kali Anda redeploy, isi disk lama dihapus dan folder sesi ikut hilang,
sehingga harus scan ulang.

Solusinya: pakai fitur **Volume** Railway (disk permanen yang tetap ada
walau container dibuat ulang). Langkah setup (sekali saja):

1. Buka project bot ini di dashboard Railway → pilih service-nya.
2. Buka tab **Volumes** → **New Volume**.
3. Isi **Mount Path** dengan `/data`, lalu simpan.
4. Redeploy service.

Kode bot ini sudah otomatis mendeteksi kalau berjalan di Railway
(lewat variabel `RAILWAY_ENVIRONMENT_ID` yang disuntik Railway) dan akan
menyimpan sesi ke `/data/auth_info` — persis di dalam volume yang baru Anda
buat. Kalau lupa membuat volume, bot tetap akan berjalan (folder dibuat
otomatis), tapi sesinya akan hilang lagi di redeploy berikutnya — cek log
startup, bot akan mengingatkan soal ini.

Kalau mau path lain, override manual lewat env var `AUTH_DIR` (isi dengan
path di dalam mount volume Anda), itu akan selalu menang dari deteksi
otomatis di atas.

**Catatan:** ini hanya menyangkut *redeploy* (push kode baru / restart
service). Kalau Anda logout dari WhatsApp di HP, atau menghapus perangkat
tertaut dari menu WhatsApp → Perangkat Tertaut, sesi tetap akan invalid dan
harus scan ulang — itu di luar kendali bot manapun.
