require('dotenv').config();

const path = require('path');
const express = require('express');
const qrcode = require('qrcode');

const bot = require('./bot');
const auth = require('./lib/auth');

const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, 'frontend');
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

const app = express();

app.use(express.json());
app.use(express.static(FRONTEND_DIR, { index: false }));

app.get('/login', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'login.html'));
});

app.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!auth.verifyCredentials(email, password)) {
    return res.status(401).json({ ok: false, error: 'Email atau password salah.' });
  }
  const token = auth.createSession(String(email).trim().toLowerCase());
  auth.setSessionCookie(res, token, COOKIE_SECURE);
  res.json({ ok: true });
});

app.post('/logout', (req, res) => {
  const cookies = auth.parseCookies(req);
  auth.destroySession(cookies[auth.SESSION_COOKIE]);
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/', auth.requireAuth, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.get('/status', auth.requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(bot.getState());
});

app.get('/qr', auth.requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  const data = bot.getQRData();
  if (!data) {
    return res
      .status(404)
      .send('QR tidak tersedia saat ini (mungkin sudah terhubung, atau sedang mode pairing code).');
  }
  try {
    const png = await qrcode.toBuffer(data, { type: 'png', width: 320 });
    res.type('png').send(png);
  } catch (err) {
    res.status(500).send('Gagal membuat QR: ' + err.message);
  }
});

app.get('/qr-data', auth.requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const data = bot.getQRData();
  res.json({ ok: !!data, data });
});

app.get('/qr-start', auth.requireAuth, async (req, res) => {
  const result = await bot.requestQrMode();
  if (!result.ok) return res.status(result.status || 500).json(result);
  res.json(result);
});

app.get('/pair', auth.requireAuth, async (req, res) => {
  const number = (req.query.number || '').replace(/[^0-9]/g, '');
  if (!number || number.length < 8) {
    return res.status(400).json({ ok: false, error: 'Parameter "number" wajib diisi dengan format lengkap kode negara, contoh: 62812xxxxxxxx' });
  }

  const result = await bot.requestPairingCode(number);
  if (!result.ok) return res.status(result.status || 500).json(result);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});

bot.init().catch((err) => {
  console.error('[startup] Gagal memulai socket:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
