// Upscale gambar LOKAL pakai Real-ESRGAN (implementasi ncnn-vulkan) —
// menggantikan DeepAI (cloud) untuk fitur .upscale dan .animehd.
//
// Butuh binary `realesrgan-ncnn-vulkan` sudah terpasang & ada di PATH.
// Model bawaannya (realesrgan-x4plus, realesrgan-x4plus-anime, dst) sudah
// dibundel bareng binary-nya sendiri, jadi tidak perlu download model manual.
// Lihat README bagian "Real-ESRGAN lokal" untuk cara pasang di lokal/VPS
// maupun di Railway (nixpacks.toml).
//
// Catatan: ncnn-vulkan butuh device Vulkan (GPU asli, atau software
// renderer seperti Mesa lavapipe untuk server tanpa GPU). Kalau tidak ada
// device Vulkan sama sekali, proses akan gagal — pesan error di bawah
// mengarahkan ke README untuk troubleshooting.

const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const BIN = process.env.REALESRGAN_BIN || 'realesrgan-ncnn-vulkan';
const DEFAULT_MODEL = process.env.REALESRGAN_MODEL || 'realesrgan-x4plus';
const ANIME_MODEL = process.env.REALESRGAN_ANIME_MODEL || 'realesrgan-x4plus-anime';
const TIMEOUT_MS = Number(process.env.REALESRGAN_TIMEOUT_MS || 120000);

async function runRealesrgan(buffer, { model, scale = 4 }) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'realesrgan-'));
  const inputPath = path.join(tmpDir, 'input.png');
  const outputPath = path.join(tmpDir, 'output.png');

  try {
    await fs.writeFile(inputPath, buffer);

    const args = ['-i', inputPath, '-o', outputPath, '-s', String(scale), '-n', model];

    await new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      } catch (err) {
        reject(err);
        return;
      }

      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        reject(new Error(`Proses ${BIN} timeout setelah ${TIMEOUT_MS}ms.`));
      }, TIMEOUT_MS);

      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err.code === 'ENOENT') {
          reject(new Error(
            `Binary "${BIN}" tidak ditemukan di PATH. Pastikan Real-ESRGAN ` +
            `(ncnn-vulkan) sudah terpasang — lihat README bagian "Real-ESRGAN lokal".`
          ));
        } else {
          reject(err);
        }
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(
            `${BIN} keluar dengan kode ${code} (kemungkinan tidak ada device Vulkan ` +
            `yang cocok di server ini — lihat README).\n${stderr.slice(0, 300)}`
          ));
        }
      });
    });

    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function upscaleImage(buffer) {
  return runRealesrgan(buffer, { model: DEFAULT_MODEL, scale: 4 });
}

async function animeHdImage(buffer) {
  return runRealesrgan(buffer, { model: ANIME_MODEL, scale: 4 });
}

module.exports = { upscaleImage, animeHdImage };
