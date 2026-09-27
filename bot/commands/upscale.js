const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { upscaleImage } = require('../lib/deepai');
const { getTargetImage } = require('../lib/mediaTarget');

async function handler(ctx) {
  const { sock, msg, jid, logger } = ctx;

  const target = getTargetImage(msg);
  if (!target) {
    return ctx.reply({
      text: 'Kirim gambar dengan caption *.upscale*, atau reply gambar dengan perintah itu.',
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

    const resultBuffer = await upscaleImage(buffer);

    await sock.sendMessage(jid, { image: resultBuffer, caption: '✅ Selesai di-upscale.' }, { quoted: msg });
    await ctx.reactOk();
  } catch (err) {
    console.error('[upscale] Gagal memproses:', err);
    await ctx.reactError();
    await ctx.reply({ text: `Gagal upscale gambar.\n\n${err.message}` });
  }
}

module.exports = {
  name: 'upscale',
  aliases: ['hd', 'perbesar'],
  description: 'Perbesar resolusi & pertajam gambar (DeepAI). Kirim/reply gambar dengan .upscale',
  handler,
};
