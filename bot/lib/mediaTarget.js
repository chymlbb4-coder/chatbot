// Helper untuk mengambil media target (gambar/video/gif) dari sebuah pesan,
// baik yang dikirim langsung maupun yang di-reply (quoted).

function getQuoted(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const quotedMessage = ctx?.quotedMessage;
  if (!ctx || !quotedMessage) return null;

  return {
    ctx,
    quotedMessage,
    fullMsg: {
      key: {
        remoteJid: msg.key.remoteJid,
        id: ctx.stanzaId,
        fromMe: false,
        participant: ctx.participant,
      },
      message: quotedMessage,
    },
  };
}

/**
 * Cari gambar target: langsung terlampir atau di-reply.
 * Return { mediaMsg, fullMsg } atau null.
 */
function getTargetImage(msg) {
  const direct = msg.message?.imageMessage;
  if (direct) return { mediaMsg: direct, fullMsg: msg };

  const quoted = getQuoted(msg);
  const quotedImage = quoted?.quotedMessage?.imageMessage;
  if (quotedImage) return { mediaMsg: quotedImage, fullMsg: quoted.fullMsg };

  return null;
}

/**
 * Cari video target (video biasa, BUKAN gif-playback): langsung atau di-reply.
 */
function getTargetVideo(msg) {
  const direct = msg.message?.videoMessage;
  if (direct && !direct.gifPlayback) return { mediaMsg: direct, fullMsg: msg };

  const quoted = getQuoted(msg);
  const quotedVideo = quoted?.quotedMessage?.videoMessage;
  if (quotedVideo && !quotedVideo.gifPlayback) return { mediaMsg: quotedVideo, fullMsg: quoted.fullMsg };

  return null;
}

/**
 * Cari media "gif": di WhatsApp, gif dikirim sebagai videoMessage dengan
 * flag gifPlayback=true, atau sebagai documentMessage bermimetype image/gif.
 */
function getTargetGif(msg) {
  const directVideo = msg.message?.videoMessage;
  if (directVideo?.gifPlayback) return { mediaMsg: directVideo, fullMsg: msg, kind: 'video' };

  const directDoc = msg.message?.documentMessage;
  if (directDoc && /gif/i.test(directDoc.mimetype || '')) {
    return { mediaMsg: directDoc, fullMsg: msg, kind: 'document' };
  }

  const quoted = getQuoted(msg);
  const quotedVideo = quoted?.quotedMessage?.videoMessage;
  if (quotedVideo?.gifPlayback) return { mediaMsg: quotedVideo, fullMsg: quoted.fullMsg, kind: 'video' };

  const quotedDoc = quoted?.quotedMessage?.documentMessage;
  if (quotedDoc && /gif/i.test(quotedDoc.mimetype || '')) {
    return { mediaMsg: quotedDoc, fullMsg: quoted.fullMsg, kind: 'document' };
  }

  return null;
}

/**
 * Cari media apapun yang relevan (gambar atau video, prioritas apa adanya)
 * dipakai untuk command generik ".s" / ".sticker".
 */
function getTargetAny(msg) {
  const image = getTargetImage(msg);
  if (image) return { ...image, type: 'image' };

  const gif = getTargetGif(msg);
  if (gif) return { ...gif, type: 'gif' };

  const video = getTargetVideo(msg);
  if (video) return { ...video, type: 'video' };

  return null;
}

function extFromMimetype(mimetype) {
  if (!mimetype) return 'mp4';
  if (mimetype.includes('gif')) return 'gif';
  if (mimetype.includes('webm')) return 'webm';
  return 'mp4';
}

module.exports = {
  getTargetImage,
  getTargetVideo,
  getTargetGif,
  getTargetAny,
  extFromMimetype,
};
