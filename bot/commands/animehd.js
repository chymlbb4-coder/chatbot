const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { animeHdImage } = require('../lib/deepai');
const { getTargetImage } = require('../lib/mediaTarget');

async function handler(ctx) {
  const { sock, msg, jid, logger } = ctx;

  const target = getTargetImage(msg);
  if (!target) {
    return ctx.reply({
      text: 'Kirim gambar (idealnya gambar anime/ilustrasi) dengan caption *.animehd*, atau reply gambar dengan perintah itu.',
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

    const resultBuffer = await animeHdImage(buffer);

    await sock.sendMessage(jid, { image: resultBuffer, caption: '✅ Selesai jadi HD (waifu2x).' }, { quoted: msg });
    await ctx.reactOk();
  } catch (err) {
    console.error('[animehd] Gagal memproses:', err);
    await ctx.reactError();
    await ctx.reply({ text: `Gagal memproses ke anime HD.\n\n${err.message}` });
  }
}

module.exports = {
  name: 'animehd',
  aliases: ['waifu2x', 'animeupscale'],
  description: 'Perhalus & perbesar gambar ala-anime dengan pengurangan noise (DeepAI waifu2x). Kirim/reply gambar dengan .animehd',
  handler,
};
