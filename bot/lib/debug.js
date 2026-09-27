function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatTime(date = new Date()) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function normalizeSenderNumber(jid) {
  if (!jid) return 'unknown';
  return jid.split('@')[0].split(':')[0];
}

function debugLog({ isGroup, sender, text }) {
  const time = formatTime();
  const scope = isGroup ? '[GROUP]' : '[PRIVATE]';
  const number = normalizeSenderNumber(sender);
  console.log(`[${time}] ${scope} ${text} -> ${number}`);
}

module.exports = { debugLog };
