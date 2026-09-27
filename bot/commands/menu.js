const { loadCommands } = require('../commandRouter');

async function handler(ctx) {
  const commands = loadCommands();
  const seen = new Set();
  const lines = [];

  for (const mod of commands.values()) {
    if (seen.has(mod.name)) continue;
    seen.add(mod.name);
    const aliasText = mod.aliases?.length ? ` (${mod.aliases.join(', ')})` : '';
    lines.push(`• *.${mod.name}*${aliasText} — ${mod.description || ''}`);
  }

  await ctx.reply({
    text:
      `🎨 *Menu Sticker Bot*\n\n${lines.join('\n')}\n\n` +
      `_Kirim atau reply gambar/video/gif dengan .s (atau .sticker) — bot otomatis deteksi jenisnya. ` +
      `Video/gif otomatis dipotong maks ${require('../lib/stickerConvert').MAX_ANIMATED_DURATION_SEC} detik._`,
  });
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'm'],
  description: 'Menampilkan daftar command',
  handler,
};
