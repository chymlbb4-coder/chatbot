const sharp = require('sharp');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpegPath);

// Batas durasi untuk stiker animasi (video & gif), sesuai permintaan: 10 detik.
const MAX_ANIMATED_DURATION_SEC = 10;
const MAX_ANIMATED_SIZE_BYTES = 1024 * 1024;

function tmpFile(ext) {
  return path.join(os.tmpdir(), `sticker-${crypto.randomBytes(8).toString('hex')}.${ext}`);
}

/**
 * Ubah gambar diam menjadi stiker WebP persegi (dengan padding transparan).
 */
async function toImageStickerWebp(buffer) {
  return sharp(buffer)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 90 })
    .toBuffer();
}

// Nama lama tetap tersedia (dipakai di beberapa tempat) sebagai alias.
const toSquareStickerWebp = toImageStickerWebp;

/**
 * Ubah video/gif menjadi stiker WebP animasi, dipotong maksimal
 * MAX_ANIMATED_DURATION_SEC detik dan dikompres bertahap sampai <=1MB.
 */
async function toAnimatedStickerWebp(buffer, { inputExt = 'mp4', maxDurationSec = MAX_ANIMATED_DURATION_SEC } = {}) {
  const inputPath = tmpFile(inputExt);
  const outputPath = tmpFile('webp');

  await fs.writeFile(inputPath, buffer);

  const attempts = [
    { fps: 15, quality: 65 },
    { fps: 12, quality: 50 },
    { fps: 10, quality: 40 },
  ];

  try {
    let lastResult = null;

    for (const { fps, quality } of attempts) {
      await runFfmpeg(inputPath, outputPath, fps, quality, maxDurationSec);
      const result = await fs.readFile(outputPath);
      lastResult = result;
      if (result.length <= MAX_ANIMATED_SIZE_BYTES) {
        return result;
      }
    }

    return lastResult;
  } finally {
    await fs.rm(inputPath, { force: true });
    await fs.rm(outputPath, { force: true });
  }
}

function runFfmpeg(inputPath, outputPath, fps, quality, maxDurationSec) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(['-t', String(maxDurationSec)])
      .outputOptions([
        '-vcodec', 'libwebp',
        '-vf', `scale=512:512:force_original_aspect_ratio=decrease,fps=${fps},pad=512:512:-1:-1:color=0x00000000,setsar=1`,
        '-loop', '0',
        '-preset', 'default',
        '-an',
        '-vsync', '0',
        '-quality', String(quality),
      ])
      .format('webp')
      .on('error', reject)
      .on('end', resolve)
      .save(outputPath);
  });
}

module.exports = {
  toImageStickerWebp,
  toSquareStickerWebp,
  toAnimatedStickerWebp,
  MAX_ANIMATED_DURATION_SEC,
};
