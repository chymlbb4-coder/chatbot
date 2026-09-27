const path = require('path');
const fs = require('fs');
const pino = require('pino');
const { EventEmitter } = require('events');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

// PENTING (khusus deploy di Railway): default folder sesi diarahkan ke
// /data/auth_info. Supaya TIDAK perlu scan ulang QR / pairing setiap kali
// redeploy, buat sebuah "Volume" di Railway (tab Volumes pada service ini)
// dan mount ke path /data — dengan begitu folder ini persisten walau
// container dibuat ulang. Kalau AUTH_DIR di-set manual lewat env var, nilai
// itu yang dipakai (mis. untuk menjalankan bot secara lokal tanpa volume).
const DEFAULT_AUTH_DIR = process.env.RAILWAY_ENVIRONMENT_ID
  ? '/data/auth_info'
  : path.join(__dirname, '..', 'auth_info');
const AUTH_DIR = process.env.AUTH_DIR || DEFAULT_AUTH_DIR;
const PAIRING_NUMBER = process.env.WA_PAIRING_NUMBER || null;
const USE_PAIRING = process.env.WA_USE_PAIRING === 'true' || !!PAIRING_NUMBER;
const PAIRING_RETRY_MS = Number(process.env.WA_PAIRING_RETRY_MS || 20000);

const MAX_LINK_ATTEMPT_FAILURES = Number(process.env.WA_MAX_LINK_ATTEMPT_FAILURES || 3);
const RECONNECT_BASE_DELAY_MS = Number(process.env.WA_RECONNECT_BASE_DELAY_MS || 2000);
const RECONNECT_MAX_DELAY_MS = Number(process.env.WA_RECONNECT_MAX_DELAY_MS || 30000);

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
console.log(`[auth] Menyimpan sesi WhatsApp di: ${AUTH_DIR}`);
if (process.env.RAILWAY_ENVIRONMENT_ID && !process.env.AUTH_DIR) {
  console.log(
    '[auth] Terdeteksi berjalan di Railway. Pastikan sudah membuat Volume ' +
    'dan mount ke /data, kalau tidak sesi ini akan hilang tiap redeploy ' +
    'dan Anda harus scan QR / pairing ulang.'
  );
}

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });
const bus = new EventEmitter();

let sock = null;
let latestQR = null;
let connectionStatus = 'starting';
let lastPairingCode = null;
let pairingRetryTimer = null;
let ownNumber = null;
let desiredMode = (USE_PAIRING && PAIRING_NUMBER) ? 'pairing' : 'qr';
let lastDisconnectReason = null;
let connectedSince = null;
let quickDropCount = 0;
let linkAttemptFailures = 0;
let hasOpenedThisAuth = false;
let reconnectAttempt = 0;
let reconnectTimer = null;
let knownIssueNotice = null;

function normalizeJidNumber(jid) {
  if (!jid) return null;
  return jid.split('@')[0].split(':')[0];
}

function isSelfChat(jid) {
  if (!ownNumber) return false;
  return normalizeJidNumber(jid) === ownNumber;
}

function isSocketOpen() {
  return !!(sock && sock.ws && sock.ws.readyState === 1);
}

function waitForSocketOpen(timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (isSocketOpen()) return resolve(true);
      if (Date.now() - start > timeoutMs) return reject(new Error('Koneksi ke WhatsApp belum siap, coba lagi.'));
      setTimeout(check, 200);
    };
    check();
  });
}

function stopPairingRetry() {
  if (pairingRetryTimer) {
    clearTimeout(pairingRetryTimer);
    pairingRetryTimer = null;
  }
}

function schedulePairingRequest(delayMs) {
  stopPairingRetry();
  pairingRetryTimer = setTimeout(async () => {
    if (!sock || sock.authState?.creds?.registered) return;
    try {
      desiredMode = 'pairing';
      const code = await sock.requestPairingCode(PAIRING_NUMBER);
      lastPairingCode = code;
      connectionStatus = 'pairing_ready';
      console.log('[pairing] Kode pairing:', code);
    } catch (err) {
      console.error('[pairing] Gagal meminta kode pairing:', err.message);
    } finally {
      if (!sock?.authState?.creds?.registered) {
        schedulePairingRequest(PAIRING_RETRY_MS);
      }
    }
  }, delayMs);
}

function wipeAuthDir() {
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  } catch (err) {
    console.error('[auth] Gagal membersihkan auth_info lama:', err.message);
  }
}

function stopReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  stopReconnectTimer();
  const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt);
  const jitter = Math.floor(Math.random() * 500);
  reconnectAttempt += 1;
  console.log(`[connection] Reconnect dalam ${delay + jitter}ms (percobaan ke-${reconnectAttempt}).`);
  reconnectTimer = setTimeout(() => {
    connect().catch((err) => console.error('[connection] Gagal reconnect:', err));
  }, delay + jitter);
}

async function connect() {
  stopPairingRetry();
  stopReconnectTimer();
  hasOpenedThisAuth = false;

  if (sock) {
    try { sock.ev.removeAllListeners(); } catch (err) {}
    try { sock.end(undefined); } catch (err) {}
    sock = null;
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    auth: state,
    version,
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
  });

  if (USE_PAIRING && PAIRING_NUMBER && !sock.authState.creds.registered) {
    schedulePairingRequest(3500);
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    try {
      handleConnectionUpdate(update);
    } catch (err) {
      console.error('[connection] Error di connection.update:', err);
    }
  });

  function handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr && desiredMode === 'qr') {
      latestQR = qr;
      connectionStatus = 'qr_ready';
      console.log('[connection] QR siap. Buka /qr atau tab "Kode QR" di browser untuk scan.');
    }

    if (connection === 'open') {
      connectionStatus = 'connected';
      connectedSince = Date.now();
      lastDisconnectReason = null;
      quickDropCount = 0;
      linkAttemptFailures = 0;
      reconnectAttempt = 0;
      knownIssueNotice = null;
      hasOpenedThisAuth = true;
      latestQR = null;
      ownNumber = normalizeJidNumber(sock.user?.id);
      stopPairingRetry();
      stopReconnectTimer();
      console.log('[connection] Terhubung ke WhatsApp.');
      bus.emit('connection.open');
    }

    if (connection === 'close') {
      stopPairingRetry();
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const wasJustConnected = connectedSince && (Date.now() - connectedSince) < 20000;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      const wasPairingAttempt = desiredMode === 'pairing';

      lastDisconnectReason = {
        statusCode: statusCode || null,
        message: lastDisconnect?.error?.message || null,
        rightAfterConnect: !!wasJustConnected,
      };

      latestQR = null;
      ownNumber = null;
      connectedSince = null;

      if (statusCode === DisconnectReason.restartRequired) {
        connectionStatus = 'restarting';
        console.log('[connection] Kode 515 (restartRequired) — registrasi diterima, reconnect untuk menuntaskan sesi.');
        connect().catch((err) => console.error('[connection] Gagal restart setelah registrasi:', err));
        return;
      }

      if (wasJustConnected) {
        quickDropCount += 1;
      } else {
        quickDropCount = 0;
      }

      console.log('[connection] Terputus. Reconnect:', shouldReconnect, 'code:', statusCode, 'rightAfterConnect:', wasJustConnected);

      if (wasJustConnected && quickDropCount >= 4) {
        connectionStatus = 'pairing_failed';
        console.log('[connection] Perangkat ditolak berulang kali tepat setelah tertaut (kemungkinan sesi rusak). Menghapus auth_info dan menunggu pairing baru.');
        wipeAuthDir();
        quickDropCount = 0;
        scheduleReconnect();
        return;
      }

      const codeAlreadyIssued = connectionStatus === 'pairing_ready';

      if (!hasOpenedThisAuth && shouldReconnect) {
        linkAttemptFailures += 1;

        if (linkAttemptFailures >= MAX_LINK_ATTEMPT_FAILURES) {
          connectionStatus = 'link_failed_known_issue';
          knownIssueNotice =
            'Gagal menautkan perangkat ' + linkAttemptFailures + 'x berturut-turut sebelum sesi benar-benar terbuka. ' +
            'Ini kemungkinan bug di sisi WhatsApp/Baileys yang belum ada fix resminya (server tidak pernah mengirim ' +
            'konfirmasi pairing selesai). Coba lagi beberapa saat lagi lewat /qr-start atau /pair, atau coba ganti ' +
            'metode (QR <-> kode pairing).';
          console.log('[connection] ' + knownIssueNotice);
          linkAttemptFailures = 0;
          return;
        }

        if (wasPairingAttempt && codeAlreadyIssued) {
          connectionStatus = 'pairing_failed';
          console.log('[connection] Percobaan tautan gagal sebelum selesai. Menunggu permintaan baru dari pengguna.');
          return;
        }

        connectionStatus = 'disconnected';
        scheduleReconnect();
        return;
      }

      connectionStatus = shouldReconnect ? 'disconnected' : 'logged_out';
      if (shouldReconnect) {
        scheduleReconnect();
      } else {
        console.log('[connection] Logged out. Perangkat perlu ditautkan ulang lewat halaman web.');
      }
    }
  }

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    try {
      if (!ownNumber && sock.user?.id) ownNumber = normalizeJidNumber(sock.user.id);
    } catch (err) {
      console.error('[connection] Gagal membaca nomor sendiri:', err);
    }

    for (const msg of messages) {
      try {
        const jid = msg.key?.remoteJid;
        if (!jid) continue;
        const isGroup = jid.endsWith('@g.us');
        bus.emit('message', {
          sock,
          msg,
          jid,
          isGroup,
          isSelfChat: isSelfChat(jid),
        });
      } catch (err) {
        console.error('[connection] Gagal memproses satu pesan masuk:', err);
      }
    }
  });
}

async function init() {
  await connect();
}

async function requestQrMode() {
  if (connectionStatus === 'connected') {
    return { ok: false, status: 409, error: 'Perangkat sudah terhubung ke WhatsApp.' };
  }

  const switchingMode = desiredMode !== 'qr';
  const needsFreshSocket = !sock || switchingMode || connectionStatus === 'pairing_ready' || connectionStatus === 'pairing_failed' || connectionStatus === 'logged_out' || connectionStatus === 'link_failed_known_issue';

  desiredMode = 'qr';

  if (!needsFreshSocket) {
    return { ok: true };
  }

  try {
    stopPairingRetry();
    stopReconnectTimer();
    latestQR = null;
    lastPairingCode = null;
    connectionStatus = 'starting';
    linkAttemptFailures = 0;
    reconnectAttempt = 0;
    knownIssueNotice = null;
    wipeAuthDir();
    await connect();
    return { ok: true };
  } catch (err) {
    return { ok: false, status: 500, error: err.message || 'Gagal memulai QR.' };
  }
}

async function requestPairingCode(number) {
  if (connectionStatus === 'connected') {
    return { ok: false, status: 409, error: 'Perangkat sudah terhubung ke WhatsApp.' };
  }

  try {
    stopPairingRetry();
    stopReconnectTimer();
    desiredMode = 'pairing';
    latestQR = null;
    lastPairingCode = null;
    connectionStatus = 'starting';
    linkAttemptFailures = 0;
    reconnectAttempt = 0;
    knownIssueNotice = null;
    wipeAuthDir();

    await connect();

    await new Promise((resolve) => setTimeout(resolve, 3500));

    if (sock.authState?.creds?.registered) {
      connectionStatus = 'connected';
      return { ok: false, status: 409, error: 'Perangkat sudah terhubung ke WhatsApp.' };
    }

    let code = null;
    let lastErr = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        code = await sock.requestPairingCode(number);
        lastErr = null;
        break;
      } catch (attemptErr) {
        lastErr = attemptErr;
        console.log(`[pairing] Percobaan ke-${attempt + 1} gagal:`, attemptErr.message);
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    if (!code) throw lastErr || new Error('Gagal meminta kode pairing.');

    lastPairingCode = code;
    connectionStatus = 'pairing_ready';
    return { ok: true, code, number };
  } catch (err) {
    desiredMode = 'pairing';
    connectionStatus = 'pairing_failed';
    return { ok: false, status: 500, error: err.message || 'Gagal meminta kode pairing. Pastikan nomor benar dan coba lagi.' };
  }
}

function getState() {
  return {
    status: connectionStatus,
    hasQR: !!latestQR,
    pairingMode: USE_PAIRING,
    mode: desiredMode,
    number: ownNumber,
    connectedSince,
    lastDisconnectReason,
    linkAttemptFailures,
    knownIssueNotice,
  };
}

function getQRData() {
  return latestQR;
}

module.exports = {
  bus,
  logger,
  init,
  requestQrMode,
  requestPairingCode,
  getState,
  getQRData,
};
