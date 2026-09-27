// Klien untuk DeepAI (https://deepai.org) — API ini terdaftar di kategori
// "Machine Learning" pada repo https://github.com/public-apis/public-apis
//
// DeepAI gratis dipakai dengan API key (daftar gratis di deepai.org, dapat
// jatah ratusan request/bulan tanpa biaya). Kita pakai 3 model-nya:
//   - torch-srgan        -> upscale / perbesar resolusi gambar
//   - waifu2x            -> upscale + halus ala-anime ("HD anime")
//   - background-remover -> hapus background otomatis
//
// Tidak butuh library tambahan: pakai fetch/FormData/Blob bawaan Node.js 20+.

const { fetchWithTimeout } = require('./http');

const DEEPAI_BASE_URL = 'https://api.deepai.org/api';

function getApiKey() {
  const key = process.env.DEEPAI_API_KEY;
  if (!key) {
    throw new Error(
      'DEEPAI_API_KEY belum diisi di .env. Daftar gratis di https://deepai.org/dashboard/profile untuk dapat API key.'
    );
  }
  return key;
}

/**
 * Panggil satu model DeepAI dengan sebuah gambar (Buffer), lalu kembalikan
 * Buffer hasil (mengunduh output_url yang dikembalikan DeepAI).
 */
async function callDeepAiImageModel(model, buffer, filename = 'input.jpg') {
  const apiKey = getApiKey();

  const form = new FormData();
  form.append('image', new Blob([buffer]), filename);

  const res = await fetchWithTimeout(`${DEEPAI_BASE_URL}/${model}`, {
    method: 'POST',
    headers: { 'api-key': apiKey },
    body: form,
  }, 90000);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DeepAI (${model}) gagal (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data?.output_url) {
    throw new Error(`DeepAI (${model}) tidak mengembalikan output_url. Respons: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const outputRes = await fetchWithTimeout(data.output_url, {}, 60000);
  if (!outputRes.ok) {
    throw new Error(`Gagal mengunduh hasil dari DeepAI (${outputRes.status}).`);
  }

  const arrayBuffer = await outputRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function upscaleImage(buffer, filename) {
  return callDeepAiImageModel('torch-srgan', buffer, filename);
}

async function animeHdImage(buffer, filename) {
  return callDeepAiImageModel('waifu2x', buffer, filename);
}

async function removeBackgroundImage(buffer, filename) {
  return callDeepAiImageModel('background-remover', buffer, filename);
}

module.exports = { upscaleImage, animeHdImage, removeBackgroundImage };
