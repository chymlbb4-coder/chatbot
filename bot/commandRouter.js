const fs = require('fs');
const path = require('path');
const { debugLog } = require('./lib/debug');
const { isAllowed } = require('./lib/accessControl');

const PREFIXES = ['.', '/', '!'];
const COMMANDS_DIR = path.join(__dirname, 'commands');

function loadCommands() {
  const commands = new Map();

  const files = fs
    .readdirSync(COMMANDS_DIR)
    .filter((f) => f.endsWith('.js'));

  for (const file of files) {
    const loaded = require(path.join(COMMANDS_DIR, file));
    const mods = Array.isArray(loaded) ? loaded : [loaded];

    for (const mod of mods) {
      if (!mod || !mod.name || typeof mod.handler !== 'function') {
        console.warn(`[commandRouter] Melewati satu entri di ${file}: format command tidak valid.`);
        continue;
      }

      const names = [mod.name, ...(mod.aliases || [])];
      for (const n of names) {
        commands.set(n.toLowerCase(), mod);
      }
    }
  }

  return commands;
}

function extractText(msg) {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  );
}

function parseCommand(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const prefix = PREFIXES.find((p) => trimmed.startsWith(p));
  if (!prefix) return null;

  const withoutPrefix = trimmed.slice(prefix.length);
  const [cmd, ...rest] = withoutPrefix.split(/\s+/);
  if (!cmd) return null;

  return {
    command: cmd.toLowerCase(),
    args: rest,
    text: rest.join(' '),
  };
}

function getSenderId(msg, jid, isGroup) {
  if (isGroup) return msg.key.participant || 'unknown';
  return jid;
}

function register(bus, logger) {
  const commands = loadCommands();
  console.log(`[commandRouter] ${commands.size} alias command dimuat dari ${COMMANDS_DIR}`);

  bus.on('message', async ({ sock, msg, jid, isGroup, isSelfChat }) => {
    try {
      if (!msg.message) return;
      if (!jid || jid === 'status@broadcast') return;

      const text = extractText(msg);
      const sender = getSenderId(msg, jid, isGroup);

      if (msg.key.fromMe && !isGroup && !isSelfChat) return;

      const parsed = parseCommand(text);
      if (!parsed) return;

      const cmdMod = commands.get(parsed.command);
      if (!cmdMod) return;

      if (!cmdMod.bypassAccessControl && !isAllowed({ jid, isGroup, sender, isSelfChat })) {
        console.log(`[commandRouter] Akses ditolak untuk ${isGroup ? jid : sender}`);
        return;
      }

      debugLog({ isGroup, sender, text: text.trim() });

      const ctx = {
        sock,
        msg,
        jid,
        isGroup,
        args: parsed.args,
        text: parsed.text,
        logger,
        reply: (content) => sock.sendMessage(jid, content, { quoted: msg }),
        reactWait: () => sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } }),
        reactOk: () => sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }),
        reactError: () => sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }),
      };

      await cmdMod.handler(ctx);
    } catch (err) {
      console.error('[commandRouter] Error menjalankan command:', err);
      try {
        await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      } catch (reactErr) {}
    }
  });

  return commands;
}

module.exports = { register, loadCommands };
