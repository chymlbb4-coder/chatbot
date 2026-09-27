const crypto = require('crypto');

const SESSION_COOKIE = 'stickery_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const sessions = new Map();

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function purgeExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expires <= now) sessions.delete(token);
  }
}

function createSession(email) {
  purgeExpiredSessions();
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { email, expires: Date.now() + SESSION_TTL_MS });
  return token;
}

function destroySession(token) {
  if (token) sessions.delete(token);
}

function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expires) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function verifyCredentials(email, password) {
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = (process.env.ADMIN_PASSWORD || '').trim();

  if (!adminEmail || !adminPassword) {
    console.warn('[auth] ADMIN_EMAIL atau ADMIN_PASSWORD belum diset di environment variables Railway.');
    return false;
  }

  const givenEmail = String(email || '').trim().toLowerCase();
  const givenPassword = String(password || '').trim();

  const emailOk = givenEmail.length > 0 && timingSafeEqualStr(givenEmail, adminEmail);
  const passOk = givenPassword.length > 0 && timingSafeEqualStr(givenPassword, adminPassword);

  if (!emailOk || !passOk) {
    console.warn(
      `[auth] Login gagal. email cocok: ${emailOk} (panjang input: ${givenEmail.length}, panjang env: ${adminEmail.length}), ` +
      `password cocok: ${passOk} (panjang input: ${givenPassword.length}, panjang env: ${adminPassword.length})`,
    );
  }

  return emailOk && passOk;
}

function setSessionCookie(res, token, secure) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
}

function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const session = getSession(cookies[SESSION_COOKIE]);
  if (!session) {
    if (req.method === 'GET' && req.accepts(['html', 'json']) === 'html') {
      return res.redirect('/login');
    }
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  req.session = session;
  next();
}

module.exports = {
  SESSION_COOKIE,
  parseCookies,
  createSession,
  destroySession,
  getSession,
  verifyCredentials,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
};
