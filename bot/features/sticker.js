const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { toImageStickerWebp, toAnimatedStickerWebp, MAX_ANIMATED_DURATION_SEC } = require('../lib/stickerConvert');
const { getTargetAny, extFromMimetype } = require('../lib/mediaTarget');
const { debugLog } = require('../lib/debug');
const { isAllowed } = require('../lib/accessControl');

function isStickerCommand(text) {
  if (!text) return false;
  return /^[./!]?(s|sticker)[./!]?$/i.test(text.trim());
}

function getCaption(msg) {
  return (
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    ''
  );
}

// Fitur generik ".s" / ".sticker": deteksi otomatis gambar/video/gif yang
// dikirim langsung atau di-reply. Untuk hapus background, pakai command
// khusus ".hapusbg" (lihat bot/commands/hapusbg.js).
function register(bus, logger) {
  bus.on('message', async ({ sock, msg, jid, isGroup, isSelfChat }) => {
    try {
      if (!msg.message) return;
      if (!jid || jid === 'status@broadcast') return;
      if (msg.key.fromMe && !isGroup && !isSelfChat) return;

      const caption = getCaption(msg);
      if (!isStickerCommand(caption)) return;

      const sender = isGroup ? (msg.key.participant || 'unknown') : jid;
      if (!isAllowed({ jid, isGroup, sender, isSelfChat })) return;

      const target = getTargetAny(msg);
      if (!target) return;

      debugLog({ isGroup, sender, text: caption.trim() });

      if (target.mediaMsg.seconds && target.mediaMsg.seconds > MAX_ANIMATED_DURATION_SEC) {
        await sock.sendMessage(jid, {
          text: `⚠️ Media lebih dari ${MAX_ANIMATED_DURATION_SEC} detik, hanya ${MAX_ANIMATED_DURATION_SEC} detik pertama yang dijadikan stiker.`,
        }, { quoted: msg });
      }

      await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

      const buffer = await downloadMediaMessage(
        target.fullMsg,
        'buffer',
        {},
        { logger, reuploadRequest: sock.updateMediaMessage }
      );

      const isAnimated = target.type === 'video' || target.type === 'gif';
      const stickerBuffer = isAnimated
        ? await toAnimatedStickerWebp(buffer, { inputExt: extFromMimetype(target.mediaMsg.mimetype) })
        : await toImageStickerWebp(buffer);

      await sock.sendMessage(
        jid,
        { sticker: stickerBuffer, isAnimated },
        { quoted: msg },
      );
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
    } catch (err) {
      console.error('[sticker] Gagal memproses pesan:', err.message);
      try {
        await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      } catch (reactErr) {}
    }
  });
}

module.exports = { register };
