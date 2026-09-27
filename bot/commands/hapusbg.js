const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { removeBackgroundImage } = require('../lib/deepai');
const { toImageStickerWebp } = require('../lib/stickerConvert');
const { getTargetImage } = require('../lib/mediaTarget');

async function handler(ctx) {
  const { sock, msg, jid, logger } = ctx;

  const target = getTargetImage(msg);
  if (!target) {
    return ctx.reply({
      text: 'Kirim gambar dengan caption *.hapusbg*, atau reply gambar dengan perintah itu.',
    });
  }

  await ctx.reactWait();
  try {
    const buffer = await downloadMediaMessage(
      target.fullMsg,
      'buffer',
      {},
      { logger, reuploadRequest: sock.updateMediaMessage }
    );

    // Deteksi objek & hapus background otomatis (DeepAI background-remover).
    // Tetap pakai DeepAI: Real-ESRGAN cuma model upscale, tidak punya
    // model penghapus background.
    const cutoutBuffer = await removeBackgroundImage(buffer);

    // Bungkus hasil (PNG transparan) jadi stiker WebP 512x512.
    const stickerBuffer = await toImageStickerWebp(cutoutBuffer);

    await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg });
    await ctx.reactOk();
  } catch (err) {
    console.error('[hapusbg] Gagal memproses:', err);
    await ctx.reactError();
    await ctx.reply({ text: `Gagal menghapus background.\n\n${err.message}` });
  }
}

module.exports = {
  name: 'hapusbg',
  aliases: ['removebg', 'bghapus'],
  description: 'Hapus background gambar otomatis (DeepAI), lalu jadikan stiker. Kirim/reply gambar dengan .hapusbg',
  handler,
};
