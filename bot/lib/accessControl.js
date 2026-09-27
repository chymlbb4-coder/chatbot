function parseList(raw) {
  return (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeNumber(value) {
  if (!value) return '';
  return String(value).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

function normalizeGroupJid(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.includes('@') ? trimmed : `${trimmed}@g.us`;
}

const ALLOWED_NUMBERS = new Set(
  parseList(process.env.WA_ALLOWED_NUMBERS).map(normalizeNumber).filter(Boolean),
);

const ALLOWED_GROUPS = new Set(
  parseList(process.env.WA_ALLOWED_GROUPS).map(normalizeGroupJid).filter(Boolean),
);

function isNumberAllowed(number) {
  if (ALLOWED_NUMBERS.size === 0) return true;
  return ALLOWED_NUMBERS.has(normalizeNumber(number));
}

function isGroupAllowed(jid) {
  if (ALLOWED_GROUPS.size === 0) return true;
  return ALLOWED_GROUPS.has(jid);
}

function isAllowed({ jid, isGroup, sender, isSelfChat }) {
  if (isSelfChat) return true;
  if (isGroup) return isGroupAllowed(jid);
  return isNumberAllowed(sender || jid);
}

module.exports = {
  isAllowed,
  isNumberAllowed,
  isGroupAllowed,
  ALLOWED_NUMBERS,
  ALLOWED_GROUPS,
};
