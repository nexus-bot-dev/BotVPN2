const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const crypto = require('crypto');
const { Telegraf, Scenes, session } = require('telegraf');
const app = express();
const moment = require('moment');
const axios = require('axios');
const { setupExpiryChecker } = require('./modules/xp.js');

const fsp = require('fs').promises; 
const path = require('path');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { createssh, createvmess, createvless, createtrojan } = require('./modules/create');
const { renewssh, renewvmess, renewvless, renewtrojan } = require('./modules/renew');
const { trialssh, trialvmess, trialvless, trialtrojan } = require('./modules/trial');

const fs = require('fs');
const vars = JSON.parse(fs.readFileSync('./.vars.json', 'utf8'));

const BOT_TOKEN = vars.BOT_TOKEN;
const port = vars.PORT || 50123;
const ADMIN = vars.USER_ID; 
const NAMA_STORE = vars.NAMA_STORE || '@FTVPNSTORES';
const groupId = vars.GROUP_CHAT_ID;
const ADMIN_WA = vars.ADMIN_WA;
const GROUP_USERNAME = vars.GROUP_USERNAME;

// === Payment API VPNNexus ===
const PAYMENT_APIKEY = vars.PAYMENT_APIKEY || '';
const PAYMENT_BASE_URL = 'https://payment.vpnnexus.biz.id/api';

// Inisialisasi bot dengan session yang lebih robust
const bot = new Telegraf(BOT_TOKEN);

const adminIds = ADMIN;
console.log('Bot initialized');

const db = new sqlite3.Database('./sellvpn.db', (err) => {
  if (err) {
    console.error('Kesalahan koneksi SQLite3:', err.message);
  } else {
    console.log('Terhubung ke SQLite3');
    
    // Setup expiry checker SETELAH database terhubung
    setupExpiryChecker(bot);
  }
});

// Buat tabel Server
db.run(`CREATE TABLE IF NOT EXISTS Server ( 
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT,
  auth TEXT,
  harga INTEGER,
  nama_server TEXT,
  quota INTEGER,
  iplimit INTEGER,
  batas_create_akun INTEGER,
  total_create_akun INTEGER
)`, (err) => {
  if (err) {
    console.error('Kesalahan membuat tabel Server:', err.message);
  } else {
    console.log('Tabel Server berhasil dibuat atau sudah ada');

    // Setelah Server, buat tabel Lainnya (key-value)
    db.run(`CREATE TABLE IF NOT EXISTS Lainnya (
      key TEXT PRIMARY KEY,
      value TEXT
    )`, (err) => {
      if (err) {
        console.error('Kesalahan membuat tabel Lainnya:', err.message);
      } else {
        console.log('Tabel Lainnya (key-value) berhasil dibuat atau sudah ada');

        // Isi data default jika belum ada
        const defaults = [
          ['limittrial', '1'],
          ['reseller', 'off'],
          ['mintopup', '1000'],
          ['kelipatan_buy', '1'],
          ['blokir', ''],
          ['saweria', ''],
          ['idnotif', '1234'],
          ['bonus', '0'],
          ['logoqris', '']
        ];

        defaults.forEach(([key, value]) => {
          db.run(`INSERT OR IGNORE INTO Lainnya (key, value) VALUES (?, ?)`, [key, value], (err) => {
            if (err) {
              console.error(`Gagal menyisipkan data default ${key}:`, err.message);
            }
          });
        });
      }
    });
  }
});

// Buat tabel users
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE,
  saldo INTEGER DEFAULT 0
)`, (err) => {
  if (err) {
    console.error('Kesalahan membuat tabel users:', err.message);
  } else {
    console.log('Tabel users berhasil dibuat atau sudah ada');
  }
});

db.run(`CREATE TABLE IF NOT EXISTS akun_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  protokol TEXT,
  expired TEXT,
  server_name TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
)`, (err) => {
  if (err) {
    console.error('Kesalahan membuat tabel akun_users:', err.message);
  } else {
    console.log('Tabel akun_users berhasil dibuat atau sudah ada');
  }
});

// Tabel pending_deposits untuk sistem deposit VPNNexus
db.run(`CREATE TABLE IF NOT EXISTS pending_deposits (
  unique_code TEXT PRIMARY KEY,
  user_id INTEGER,
  username TEXT,
  amount INTEGER,
  original_amount INTEGER,
  timestamp INTEGER,
  status TEXT,
  qr_message_id INTEGER,
  transaction_id TEXT
)`, (err) => {
  if (err) {
    console.error('Kesalahan membuat tabel pending_deposits:', err.message);
  } else {
    console.log('Tabel pending_deposits berhasil dibuat atau sudah ada');
  }
});

// Tabel bonus_config
db.run(`CREATE TABLE IF NOT EXISTS bonus_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER DEFAULT 0,
  min_topup INTEGER DEFAULT 0,
  bonus_percent INTEGER DEFAULT 0
)`, (err) => {
  if (!err) {
    db.run(`INSERT OR IGNORE INTO bonus_config (id, enabled, min_topup, bonus_percent) VALUES (1, 0, 0, 0)`);
  }
});

// Tabel bonus_log
db.run(`CREATE TABLE IF NOT EXISTS bonus_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  amount INTEGER,
  bonus INTEGER,
  timestamp TEXT
)`);

// Tabel topup_log
db.run(`CREATE TABLE IF NOT EXISTS topup_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  amount INTEGER,
  method TEXT,
  waktu TEXT
)`);

// Improved State Management
class UserStateManager {
  constructor() {
    this.states = new Map();
    this.depositStates = new Map();
    this.userSessions = new Map();
    this.userLocks = new Map();
  }

  getState(userId) {
    return this.states.get(userId) || {};
  }

  setState(userId, state) {
    this.states.set(userId, { ...this.getState(userId), ...state });
  }

  clearState(userId) {
    this.states.delete(userId);
  }

  getDepositState(userId) {
    return this.depositStates.get(userId) || {};
  }

  setDepositState(userId, state) {
    this.depositStates.set(userId, { ...this.getDepositState(userId), ...state });
  }

  clearDepositState(userId) {
    this.depositStates.delete(userId);
  }

  hasActiveSession(userId) {
    return this.userSessions.has(userId);
  }

  setSession(userId) {
    this.userSessions.set(userId, true);
  }

  clearSession(userId) {
    this.userSessions.delete(userId);
  }

  acquireLock(userId) {
    if (this.userLocks.has(userId)) {
      return false;
    }
    this.userLocks.set(userId, true);
    return true;
  }

  releaseLock(userId) {
    this.userLocks.delete(userId);
  }
}

const stateManager = new UserStateManager();
console.log('User state manager initialized');

// Helper functions
const getBlockedList = (callback) => {
  db.get('SELECT value FROM Lainnya WHERE key = ?', ['blokir'], (err, row) => {
    if (err) return callback(err, []);
    const list = row?.value ? row.value.split(',').filter(Boolean) : [];
    callback(null, list);
  });
};

const updateBlockedList = (list, callback) => {
  const updated = list.join(',');
  db.run('UPDATE Lainnya SET value = ? WHERE key = ?', [updated, 'blokir'], callback);
};

function escapeMarkdown(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/[\_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// Trial System
const trialFilePath = path.join(__dirname, 'trial_limit.txt');

function ensureTrialFileExists() {
  if (!fs.existsSync(trialFilePath)) {
    fs.writeFileSync(trialFilePath, JSON.stringify({}), 'utf8');
  }
}

function getAdminId() {
  try {
    const vars = JSON.parse(fs.readFileSync('./.vars.json', 'utf8'));
    return vars.USER_ID;
  } catch (err) {
    console.error('⚠️ Gagal membaca USER_ID dari .vars.json:', err.message);
    return null;
  }
}

async function hasUsedTrial(userId, protocol, serverId) {
  const adminId = getAdminId();
  if (String(userId) === String(adminId)) return { used: false };

  ensureTrialFileExists();

  try {
    const rawData = fs.readFileSync(trialFilePath, 'utf8');
    const trials = JSON.parse(rawData || '{}');
    
    let trialLimit = 1;
    try {
      const row = await new Promise((resolve, reject) => {
        db.get('SELECT value FROM lainnya WHERE key = "triallimit"', [], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      trialLimit = row?.value ? parseInt(row.value) : 1;
    } catch (e) {
      console.error('Gagal baca trial limit dari database, menggunakan default 1:', e);
    }

    const userTrials = trials[userId]?.[protocol]?.[serverId];
    if (!userTrials) return { used: false, remaining: trialLimit };

    let timestamps = [];
    if (Array.isArray(userTrials.timestamps)) {
      timestamps = userTrials.timestamps;
    } else if (typeof userTrials === 'number') {
      timestamps = [userTrials];
    } else if (userTrials.lastTrial) {
      timestamps = [userTrials.lastTrial];
    }

    const now = Date.now();
    const validTimestamps = timestamps.filter(
      ts => now - ts < 24 * 60 * 60 * 1000
    );

    if (validTimestamps.length < trialLimit) {
      return { 
        used: false, 
        remaining: trialLimit - validTimestamps.length,
        count: validTimestamps.length,
        limit: trialLimit
      };
    }

    const oldestValid = Math.min(...validTimestamps);
    const remainingTime = 24 * 60 * 60 * 1000 - (now - oldestValid);
    
    const hours = Math.max(0, Math.floor(remainingTime / (1000 * 60 * 60)));
    const minutes = Math.max(0, Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60)));

    return {
      used: true,
      message: `❌ Anda sudah menggunakan ${validTimestamps.length}/${trialLimit} trial hari ini. Coba lagi setelah ${hours} jam ${minutes} menit.`
    };

  } catch (err) {
    console.error('Error dalam hasUsedTrial:', err);
    return { 
      used: false,
      error: true,
      message: '⚠️ Sistem trial sedang gangguan, silakan coba lagi.'
    };
  }
}

async function recordTrial(userId, protocol, serverId) {
  const adminId = getAdminId();
  if (String(userId) === String(adminId)) return;

  ensureTrialFileExists();

  try {
    const rawData = fs.readFileSync(trialFilePath, 'utf8');
    const trials = JSON.parse(rawData || '{}');

    if (!trials[userId]) trials[userId] = {};
    if (!trials[userId][protocol]) trials[userId][protocol] = {};
    if (!trials[userId][protocol][serverId]) {
      trials[userId][protocol][serverId] = { timestamps: [] };
    }

    const trialRecord = trials[userId][protocol][serverId];
    if (!Array.isArray(trialRecord.timestamps)) {
      trialRecord.timestamps = [];
      if (typeof trialRecord === 'number') {
        trialRecord.timestamps.push(trialRecord);
      }
    }

    trialRecord.timestamps.push(Date.now());
    trialRecord.count = trialRecord.timestamps.length;

    fs.writeFileSync(trialFilePath, JSON.stringify(trials, null, 2), 'utf8');
  } catch (err) {
    console.error('Error recording trial:', err);
  }
}

// Payment Helper Functions
async function getNotifId() {
  return new Promise((resolve) => {
    db.get('SELECT value FROM Lainnya WHERE key = ?', ['idnotif'], (err, row) => {
      if (err || !row) {
        console.error('Error fetching notif ID:', err?.message);
        resolve('1234');
      } else {
        resolve(row.value);
      }
    });
  });
}

async function getBonusPercentage() {
  return new Promise((resolve) => {
    db.get('SELECT value FROM Lainnya WHERE key = ?', ['bonus'], (err, row) => {
      if (err || !row) {
        console.error('Error fetching bonus percentage:', err?.message);
        resolve(0);
      } else {
        const bonus = parseInt(row.value) || 0;
        resolve(bonus);
      }
    });
  });
}

// Scene untuk topup
const topupScene = new Scenes.BaseScene('topup');
topupScene.enter(async (ctx) => {
  await ctx.replyWithMarkdownV2(
    `💳 *PILIH METODE TOP\\-UP*\n\n` +
    `Silakan pilih metode e\\-wallet untuk top\\-up:`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💰 DANA', callback_data: 'topup_select_dana' },
            { text: '📱 GOPAY', callback_data: 'topup_select_gopay' }
          ],
          [
            { text: '🛍️ SHOPEE', callback_data: 'topup_select_shopee' },
            { text: '🔵 OVO', callback_data: 'topup_select_ovo' }
          ],
          [
            { text: '❌ BATAL', callback_data: 'topup_cancel' }
          ]
        ]
      }
    }
  );
});

topupScene.action(/topup_select_(dana|gopay|shopee|ovo)/, async (ctx) => {
  const jenis = ctx.match[1];
  ctx.scene.state.jenis = jenis;
  
  await ctx.answerCbQuery(`Anda memilih ${jenis.toUpperCase()}`);
  
  try {
    await ctx.editMessageText(`Anda memilih: *${jenis.toUpperCase()}*\\!\n\nSilakan kirim nomor telepon tujuan\\.`, 
      { parse_mode: 'MarkdownV2' });
    
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch (error) {}
  
  ctx.scene.state.step = 'nomor';
});

topupScene.on('text', async (ctx) => {
  const text = ctx.message.text;
  
  if (!ctx.scene.state.step) return;
  
  if (ctx.scene.state.step === 'nomor') {
    if (!/^[0-9]+$/.test(text)) {
      return ctx.reply('⚠️ Nomor telepon harus berupa angka. Silakan kirim nomor yang valid.');
    }

    ctx.scene.state.nomor = text;
    ctx.scene.state.step = 'nominal';
    
    await ctx.reply('✅ Nomor tersimpan. Silakan kirim nominal top-up (contoh: 10000).');
    
  } else if (ctx.scene.state.step === 'nominal') {
    const nominal = parseInt(text.replace(/[^0-9]/g, ''));
    if (isNaN(nominal) || nominal <= 0) {
      return ctx.reply('⚠️ Nominal harus berupa angka yang valid dan lebih dari 0. Silakan coba lagi.');
    }

    ctx.scene.state.nominal = nominal;
    
    const { jenis, nomor } = ctx.scene.state;
    
    const escapedNomor = escapeMarkdown(nomor);
    const escapedNominal = escapeMarkdown(nominal.toLocaleString('id-ID'));
    const escapedJenis = escapeMarkdown(jenis.toUpperCase());

    await ctx.replyWithMarkdownV2(
      `💳 *KONFIRMASI TOP\\-UP*\n\n` +
      `📱 *Metode:* ${escapedJenis}\n` +
      `📞 *Nomor:* ${escapedNomor}\n` +
      `💰 *Nominal:* Rp ${escapedNominal}\n\n` +
      `Apakah data sudah benar?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ YA, PROSES', callback_data: 'topup_confirm' },
              { text: '❌ BATAL', callback_data: 'topup_cancel' }
            ]
          ]
        }
      }
    );
    
    ctx.scene.state.step = null;
  }
});

topupScene.action('topup_confirm', async (ctx) => {
  const { jenis, nomor, nominal } = ctx.scene.state;
  
  await ctx.answerCbQuery(`🔄 Memproses top-up ${jenis.toUpperCase()}...`);
  
  try {
    await ctx.editMessageText(`🔄 Memproses top-up ${jenis.toUpperCase()}...`);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch (error) {}

  try {
    const apiUrl = `https://api-v1.autsc.my.id/topup?username=${MERCHANT_ID}&token=${API_KEY}&nomor=${nomor}&nominal=${nominal}&jenis=${jenis}`;
    
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.success) {
      const escapedNomorTujuan = escapeMarkdown(data.data.nomor_tujuan);
      const escapedNominal = escapeMarkdown(data.data.nominal);
      const escapedHarga = escapeMarkdown(data.data.harga_formatted);
      const escapedIdTransaksi = escapeMarkdown(data.data.id_transaksi.toString());
      const escapedMetode = escapeMarkdown(data.data.metode_pembayaran);
      const escapedTanggal = escapeMarkdown(data.data.tanggal);
      const escapedStatus = escapeMarkdown(data.data.status);
      const escapedProduk = escapeMarkdown(data.data.produk.nama);
      const escapedProvider = escapeMarkdown(data.data.provider.nama);

      const successMessage = `
✅ *TOP\\-UP ${escapeMarkdown(jenis.toUpperCase())} BERHASIL*

📱 *Nomor Tujuan:* ${escapedNomorTujuan}
💰 *Nominal:* Rp ${escapedNominal}
💵 *Harga:* ${escapedHarga}
📊 *ID Transaksi:* ${escapedIdTransaksi}

🏦 *Metode Pembayaran:* ${escapedMetode}
📅 *Tanggal:* ${escapedTanggal}
🔄 *Status:* ${escapedStatus}

📦 *Produk:* ${escapedProduk}
📡 *Provider:* ${escapedProvider}
      `;

      await ctx.replyWithMarkdownV2(successMessage);
      
    } else {
      let errorMessage = `❌ Gagal melakukan top\\-up ${escapeMarkdown(jenis)}: ${escapeMarkdown(data.message || 'Unknown error')}`;
      
      if (data.error) {
        errorMessage += `\n\n📝 *Detail Error:* ${escapeMarkdown(data.error)}`;
      }
      
      if (data.minimal_nominal) {
        errorMessage += `\n💰 *Minimal Nominal:* Rp ${escapeMarkdown(data.minimal_nominal.toLocaleString('id-ID'))}`;
      }
      
      if (data.maksimal_nominal) {
        errorMessage += `\n💰 *Maksimal Nominal:* Rp ${escapeMarkdown(data.maksimal_nominal.toLocaleString('id-ID'))}`;
      }

      await ctx.replyWithMarkdownV2(errorMessage);
    }
  } catch (error) {
    await ctx.reply('❌ Terjadi kesalahan saat memproses top-up.');
  }
  
  ctx.scene.leave();
});

topupScene.action('topup_cancel', async (ctx) => {
  await ctx.answerCbQuery('❌ Top-up dibatalkan');
  
  try {
    await ctx.editMessageText('❌ Top-up dibatalkan.');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch (error) {}
  
  ctx.scene.leave();
});

const stage = new Scenes.Stage([topupScene]);
bot.use(session());
bot.use(stage.middleware());

// Command Handlers
bot.command('bonus', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) {
    await ctx.reply('🚫 Anda tidak memiliki izin untuk mengakses perintah ini.');
    return;
  }

  const args = ctx.message.text.split(' ').slice(1);
  const newBonus = args[0];

  if (!newBonus) {
    try {
      const bonusInfo = await getCurrentBonusInfo();
      
      const message = `🎁 *Informasi Bonus Deposit*

${bonusInfo.status}
${bonusInfo.description}

*Penggunaan:*
/bonus [persentase]
Contoh: /bonus 10 → atur bonus 10%
/bonus 0 → nonaktifkan bonus`;
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Gagal mengambil info bonus:', err.message);
      await ctx.reply('❌ *Gagal mengambil informasi bonus*', { 
        parse_mode: 'Markdown' 
      });
    }
    return;
  }

  if (isNaN(newBonus) || parseInt(newBonus) < 0 || parseInt(newBonus) > 100) {
    return ctx.reply('⚠️ *Format salah.*\n\nPersentase bonus harus antara 0-100%\n\nContoh penggunaan:\n`/bonus 10` → atur bonus 10%\n`/bonus 0` → nonaktifkan bonus', { 
      parse_mode: 'Markdown' 
    });
  }

  try {
    db.run(
      'INSERT OR REPLACE INTO lainnya (key, value) VALUES (?, ?)',
      ['bonus', newBonus],
      async function(err) {
        if (err) {
          console.error('Gagal mengubah bonus:', err.message);
          return ctx.reply('❌ *Gagal mengubah persentase bonus*', { 
            parse_mode: 'Markdown' 
          });
        }
        
        const bonusValue = parseInt(newBonus);
        let message;
        
        if (bonusValue > 0) {
          message = `✅ *Bonus deposit berhasil diatur menjadi ${bonusValue}%*

Setiap deposit akan mendapatkan bonus ${bonusValue}% dari nominal yang diisi.`;
        } else {
          message = '✅ *Bonus deposit dinonaktifkan*';
        }
        
        await ctx.reply(message, { 
          parse_mode: 'Markdown' 
        });

        console.log(`✅ Bonus percentage changed to ${bonusValue}% by admin ${ctx.from.id}`);
      }
    );
  } catch (err) {
    console.error('Gagal mengubah bonus:', err.message);
    await ctx.reply('❌ *Gagal mengubah persentase bonus*', { 
      parse_mode: 'Markdown' 
    });
  }
});

async function getCurrentBonusInfo() {
  return new Promise(async (resolve) => {
    const bonusPercentage = await getBonusPercentage();
    
    resolve({
      percentage: bonusPercentage,
      status: bonusPercentage > 0 ? `🎁 Aktif (${bonusPercentage}%)` : '❌ Nonaktif',
      description: bonusPercentage > 0 ? 
        `Setiap deposit mendapatkan bonus ${bonusPercentage}%` : 
        'Tidak ada bonus deposit saat ini'
    });
  });
}

bot.command('payment', async (ctx) => {
  const userId = ctx.message.from.id;
  console.log(`Payment command received from user_id: ${userId}`);

  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
  }

  try {
    const processingMessage = await ctx.reply('🔄 Mengambil data saldo...');

    const apiUrl = `https://api-v1.autsc.my.id/saldo?username=${MERCHANT_ID}&token=${API_KEY}`;
    
    const response = await fetch(apiUrl);
    const data = await response.json();

    await ctx.telegram.deleteMessage(ctx.chat.id, processingMessage.message_id);

    if (data.success) {
      const merchantName = escapeMarkdown(data.data.merchant_name);
      const username = escapeMarkdown(data.data.username);
      const saldoUtama = escapeMarkdown(data.data.saldo_utama);
      const saldoQris = escapeMarkdown(data.data.saldo_qris);
      const timestamp = escapeMarkdown(new Date().toLocaleString('id-ID'));

      const message = `
💳 *INFORMASI SALDO PAYMENT GATEWAY*

🏪 *Merchant:* ${merchantName}
👤 *Username:* ${username}

💰 *SALDO UTAMA:* ${saldoUtama}
💳 *SALDO QRIS:* ${saldoQris}

📊 *Update:* ${timestamp}

Gunakan command berikut sesuai kebutuhan
/wd 👉 untuk tarik saldo qris ke saldo orkut
/topup 👉 untuk tarik saldo orkut ke wallet dana, gopay dan shopee
      `;

      await ctx.replyWithMarkdownV2(message);
      
      console.log(`✅ Data saldo berhasil diambil untuk merchant: ${data.data.merchant_name}`);
    } else {
      await ctx.reply(`❌ Gagal mengambil data saldo: ${data.message || 'Unknown error'}`);
      console.error('❌ API Error:', data);
    }

  } catch (error) {
    console.error('❌ Error fetching saldo:', error);
    await ctx.reply('❌ Terjadi kesalahan saat mengambil data saldo. Silakan coba lagi nanti.');
  }
});

bot.command('topup', async (ctx) => {
  const userId = ctx.message.from.id;

  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
  }

  await ctx.scene.enter('topup');
});

bot.command('wd', async (ctx) => {
  const userId = ctx.message.from.id;
  console.log(`Withdraw command received from user_id: ${userId}`);

  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
  }

  const commandParts = ctx.message.text.split(' ');
  if (commandParts.length < 2) {
    return ctx.reply('⚠️ Format salah. Gunakan: /wd <jumlah_amount>\nContoh: /wd 40000');
  }

  const amount = parseInt(commandParts[1]);
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('⚠️ Jumlah amount harus berupa angka yang valid dan lebih dari 0.');
  }

  try {
    const escapedAmount = escapeMarkdown(amount.toLocaleString('id-ID'));
    const escapedMerchant = escapeMarkdown(MERCHANT_ID);

    const confirmMessage = await ctx.replyWithMarkdownV2(
      `⚠️ Konfirmasi Penarikan Dana\n\n` +
      `💰 *Jumlah:* Rp ${escapedAmount}\n` +
      `🏪 *Merchant:* ${escapedMerchant}\n\n` +
      `Apakah Anda yakin ingin melakukan penarikan dana?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Ya, Tarik Dana', callback_data: `wd_confirm_${amount}` }],
            [{ text: '❌ Batal', callback_data: 'wd_cancel' }]
          ]
        }
      }
    );

    ctx.session = ctx.session || {};
    ctx.session.confirmMessageId = confirmMessage.message_id;

  } catch (error) {
    console.error('❌ Error dalam command wd:', error);
    await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
  }
});

bot.action(/wd_confirm_(\d+)/, async (ctx) => {
  const userId = ctx.from.id;
  const amount = parseInt(ctx.match[1]);

  if (!adminIds.includes(userId)) {
    return ctx.answerCbQuery('⚠️ Anda tidak memiliki izin.');
  }

  try {
    await ctx.answerCbQuery('🔄 Memproses penarikan dana...');
    
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch (editError) {
      console.log('Tidak bisa menghapus inline buttons, mungkin sudah dihapus');
    }

    const processingMessage = await ctx.reply('🔄 Sedang memproses penarikan dana...');

    const apiUrl = `https://api-v1.autsc.my.id/wd?username=${MERCHANT_ID}&token=${API_KEY}&amount=${amount}`;
    
    console.log(`🔄 Calling WD API`);
    
    const response = await fetch(apiUrl);
    const data = await response.json();

    await ctx.telegram.deleteMessage(ctx.chat.id, processingMessage.message_id);

    if (data.success) {
      const escapedAmount = escapeMarkdown(amount.toLocaleString('id-ID'));
      const escapedMerchant = escapeMarkdown(MERCHANT_ID);
      const escapedStatus = escapeMarkdown(data.data.status);
      const escapedTimestamp = escapeMarkdown(new Date(parseInt(data.data.timestamp)).toLocaleString('id-ID'));
      const escapedMessage = escapeMarkdown(data.data.message);

      const successMessage = `
✅ *PENARIKAN DANA BERHASIL*

💰 *Jumlah:* Rp ${escapedAmount}
🏪 *Merchant:* ${escapedMerchant}
📊 *Status:* ${escapedStatus}
⏰ *Timestamp:* ${escapedTimestamp}

📝 *Pesan:* ${escapedMessage}

👉 gunakan command /payment untuk melihat saldo masuk atau belum
      `;

      await ctx.replyWithMarkdownV2(successMessage);
      console.log(`✅ Withdraw berhasil: Rp ${amount} untuk merchant: ${MERCHANT_ID}`);

    } else {
      let errorMessage = `❌ Gagal melakukan penarikan dana: ${escapeMarkdown(data.message || 'Unknown error')}`;
      
      if (data.error) {
        errorMessage += `\n\n📝 *Detail Error:* ${escapeMarkdown(data.error)}`;
      }
      
      if (data.minimal_amount) {
        errorMessage += `\n💰 *Minimal Amount:* Rp ${escapeMarkdown(data.minimal_amount.toLocaleString('id-ID'))}`;
      }
      
      if (data.maksimal_amount) {
        errorMessage += `\n💰 *Maksimal Amount:* Rp ${escapeMarkdown(data.maksimal_amount.toLocaleString('id-ID'))}`;
      }

      await ctx.replyWithMarkdownV2(errorMessage);
      console.error('❌ API Withdraw Error:', JSON.stringify(data, null, 2));
    }

  } catch (error) {
    console.error('❌ Error processing withdraw:', error);
    
    let errorMessage = '❌ Terjadi kesalahan saat memproses penarikan dana.';
    
    if (error.code === 'ECONNREFUSED') {
      errorMessage += '\n🌐 API server tidak dapat diakses.';
    } else if (error.message) {
      errorMessage += `\n📝 Error: ${error.message}`;
    }
    
    await ctx.reply(errorMessage);
  }
});

bot.action('wd_cancel', async (ctx) => {
  try {
    await ctx.answerCbQuery('❌ Penarikan dibatalkan');
    
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    
    const escapedMessage = escapeMarkdown('❌ Penarikan dana dibatalkan oleh pengguna.');
    await ctx.editMessageText(escapedMessage, { parse_mode: 'MarkdownV2' });
    
  } catch (error) {
    console.log('Tidak bisa mengedit pesan, mungkin sudah dihapus');
    await ctx.reply('❌ Penarikan dana dibatalkan.');
  }
});

bot.command('setidnotif', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) {
    await ctx.reply('🚫 Anda tidak memiliki izin untuk mengakses perintah ini.');
    return;
  }

  const args = ctx.message.text.split(' ').slice(1);
  const newIdNotif = args[0];

  if (!newIdNotif || isNaN(newIdNotif)) {
    return await ctx.reply(
      '⚠️ *Format salah.*\n\nContoh penggunaan:\n`/setidnotif 123456789`\nPesan: untuk mengubah ID yang menerima notifikasi',
      { parse_mode: 'Markdown' }
    );
  }

  try {
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT OR REPLACE INTO lainnya (key, value) VALUES (?, ?)',
        ['idnotif', newIdNotif],
        function(err) {
          if (err) {
            console.error('Gagal mengubah ID notifikasi:', err.message);
            reject(err);
            return;
          }
          resolve();
        }
      );
    });

    await ctx.reply(
      `✅ *ID notifikasi berhasil diubah menjadi ${newIdNotif}*\n\nNotifikasi selanjutnya akan dikirim ke ID Telegram ini.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('Gagal mengubah ID notifikasi:', err.message);
    await ctx.reply('❌ *Gagal mengubah ID notifikasi*', { 
      parse_mode: 'Markdown' 
    });
  }
});

bot.command('minbuy', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) {
    await ctx.reply('🚫 Anda tidak memiliki izin untuk mengakses perintah ini.');
    return;
  }

  const args = ctx.message.text.split(' ').slice(1);
  const newMultiple = args[0];

  if (!newMultiple || isNaN(newMultiple) || parseInt(newMultiple) <= 0) {
    return ctx.reply('⚠️ *Format salah.*\n\nContoh penggunaan:\n`/minbuy 2`\nPesan: untuk mengubah kelipatan pembelian (contoh: 2 berarti hanya bisa beli 2, 4, 6 hari dst)', { 
      parse_mode: 'Markdown' 
    });
  }

  try {
    db.run(
      'INSERT OR REPLACE INTO lainnya (key, value) VALUES (?, ?)',
      ['kelipatan_buy', newMultiple],
      function(err) {
        if (err) {
          console.error('Gagal mengubah kelipatan pembelian:', err.message);
          return ctx.reply('❌ *Gagal mengubah kelipatan pembelian*', { 
            parse_mode: 'Markdown' 
          });
        }
        
        ctx.reply(`✅ *Kelipatan pembelian berhasil diubah menjadi ${newMultiple}*\n\nSekarang pembelian hanya bisa dalam kelipatan ${newMultiple} hari ketika mode reseller aktif.`, { 
          parse_mode: 'Markdown' 
        });
      }
    );
  } catch (err) {
    console.error('Gagal mengubah kelipatan pembelian:', err.message);
    await ctx.reply('❌ *Gagal mengubah kelipatan pembelian*', { 
      parse_mode: 'Markdown' 
    });
  }
});

bot.command('blokir', async (ctx) => {
  const userId = ctx.from.id;

  if (!adminIds.includes(userId)) {
    return await ctx.reply('🚫 Anda tidak memiliki izin untuk memblokir pengguna.');
  }

  const args = ctx.message.text.split(' ').slice(1);

  if (args.length === 0) {
    getBlockedList((err, list) => {
      if (err) {
        console.error('Gagal membaca daftar blokir:', err.message);
        return ctx.reply('❌ Terjadi kesalahan saat membaca daftar blokir.');
      }

      if (list.length === 0) {
        return ctx.reply('✅ Daftar blokir kosong.');
      }

      ctx.reply(`📋 Daftar User yang Diblokir:\nGunakan format /blokir <id>\n\n${list.join('\n')}`);
    });
    return;
  }

  const targetId = args[0].trim();

  if (!/^\d+$/.test(targetId)) {
    return await ctx.reply('❗ Format salah. Gunakan:\n/blokir <user_id>\n\nContoh: /blokir 123456789');
  }

  getBlockedList((err, list) => {
    if (err) {
      console.error('Gagal membaca daftar blokir:', err.message);
      return ctx.reply('❌ Terjadi kesalahan saat memblokir user.');
    }

    if (list.includes(targetId)) {
      return ctx.reply(`⚠️ User ID ${targetId} sudah diblokir.`);
    }

    list.push(targetId);
    updateBlockedList(list, (err) => {
      if (err) {
        console.error('Gagal menyimpan blokir:', err.message);
        return ctx.reply('❌ Gagal memblokir user.');
      }
      ctx.reply(`✅ User ID ${targetId} berhasil diblokir.`);
    });
  });
});

bot.command('unblokir', async (ctx) => {
  const userId = ctx.from.id;

  if (!adminIds.includes(userId)) {
    return await ctx.reply('🚫 Anda tidak memiliki izin untuk membuka blokir.');
  }

  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return await ctx.reply('❗ Format: /unblokir <user_id>');
  }

  const targetId = args[1].trim();

  getBlockedList((err, list) => {
    if (err) {
      console.error('Gagal membaca daftar blokir:', err.message);
      return ctx.reply('❌ Terjadi kesalahan saat membuka blokir.');
    }

    if (!list.includes(targetId)) {
      return ctx.reply(`⚠️ User ID ${targetId} tidak ditemukan dalam daftar blokir.`);
    }

    const updatedList = list.filter(id => id !== targetId);
    updateBlockedList(updatedList, (err) => {
      if (err) {
        console.error('Gagal menyimpan perubahan blokir:', err.message);
        return ctx.reply('❌ Gagal membuka blokir user.');
      }
      ctx.reply(`✅ User ID ${targetId} telah dihapus dari daftar blokir.`);
    });
  });
});

const botStartTime = new Date();

async function sendMainMenu(ctx) {
  const userId = ctx.from.id;

  const now = new Date();
  const diffSec = Math.floor((now - botStartTime) / 1000);
  const days = Math.floor(diffSec / (3600 * 24));
  const hours = Math.floor((diffSec % (3600 * 24)) / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);

  const uptimeFormatted = `${days} hari ${hours} jam ${minutes} menit`;

  let jumlahServer = 0;
  let jumlahPengguna = 0;
  let saldoPengguna = null;

  try {
    const serverRow = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) AS count FROM Server', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    jumlahServer = serverRow.count;
  } catch (err) {
    console.error('Kesalahan saat mengambil jumlah server:', err.message);
  }

  try {
    const userRow = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) AS count FROM users', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    jumlahPengguna = userRow.count;
  } catch (err) {
    console.error('Kesalahan saat mengambil jumlah pengguna:', err.message);
  }

  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    saldoPengguna = row ? row.saldo : null;
  } catch (err) {
    console.error('Kesalahan saat mengambil saldo user:', err.message);
  }

  let messageText = '';
  let inlineKeyboard = [];

  try {
    const rawText = await fsp.readFile('pesan.txt', 'utf8');
    const separator = '---BUTTONS---';
    const parts = rawText.split(separator);

    messageText = parts[0].trim()
      .replace('{NAMA_STORE}', NAMA_STORE)
      .replace('{UPTIME_HARI}', uptimeFormatted)
      .replace('{JUMLAH_SERVER}', jumlahServer)
      .replace('{JUMLAH_PENGGUNA}', jumlahPengguna)
      .replace('{SALDO_PENGGUNA}', saldoPengguna !== null ? `Rp ${saldoPengguna.toLocaleString()}` : 'Tidak tersedia')
      .replace('{USER_ID}', userId);

    const parsed = JSON.parse(parts[1].trim());

    inlineKeyboard = parsed.map(row =>
      row.map(btn => {
        if (btn[2] === 'url') {
          return { text: btn[0], url: btn[1] };
        } else {
          return { text: btn[0], callback_data: btn[1] };
        }
      })
    );
  } catch (err) {
    console.error('Gagal membaca pesan.txt atau parsing JSON:', err.message);
    messageText = '*Bot sedang mengalami gangguan. Harap coba lagi nanti.*';
  }

  try {
    await ctx.editMessageText(messageText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
    console.log('Main menu sent');
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      await ctx.reply(messageText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard }
      });
      console.log('Main menu sent as new message');
    } else {
      console.error('Error saat mengirim menu utama:', error);
    }
  }
}

bot.command(['start', 'menu'], async (ctx) => {
  const userId = ctx.from.id;

  // PERBAIKAN: Clear semua state user saat memulai
  stateManager.clearState(userId);
  stateManager.clearDepositState(userId);
  stateManager.clearSession(userId);
  stateManager.releaseLock(userId);

  console.log(`🧹 State cleared for user ${userId} at start/menu`);


  db.get('SELECT value FROM Lainnya WHERE key = ?', ['blokir'], (err, row) => {
    if (err) {
      console.error('Gagal memeriksa blokir:', err.message);
    } else {
      const blocked = row?.value?.split(',').filter(Boolean) || [];
      if (blocked.includes(userId.toString())) {
        console.log(`Akses ditolak: User ID ${userId} diblokir`);
        return ctx.reply('🚫 Anda telah diblokir dari akses ke bot ini.');
      }
    }

    db.get('SELECT value FROM Lainnya WHERE key = ?', ['reseller'], (err, row) => {
      let isResellerMode = false;
      if (!err && row?.value === 'on') {
        isResellerMode = true;
      }

      db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, userRow) => {
        if (err) {
          console.error('Kesalahan saat memeriksa user_id:', err.message);
          return;
        }

        if (userRow) {
          console.log(`User ID ${userId} sudah ada di database`);
          sendMainMenu(ctx);
        } else {
          if (isResellerMode && !adminIds.includes(userId)) {
            console.log(`Akses ditolak untuk user ID ${userId}, reseller mode aktif`);
            ctx.reply('🚫 Akses ditolak. Hubungi admin untuk mendapatkan akses.');
          } else {
            db.run('INSERT INTO users (user_id, saldo) VALUES (?, ?)', [userId, 0], (err) => {
              if (err) {
                console.error('Kesalahan saat menyimpan user_id:', err.message);
              } else {
                console.log(`User ID ${userId} berhasil disimpan`);
                sendMainMenu(ctx);
              }
            });
          }
        }
      });
    });
  });
});

bot.command('reseller', async (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(' ').slice(1);

  if (!adminIds.includes(userId)) {
    await ctx.reply('🚫 Anda tidak memiliki izin untuk menjalankan perintah ini.');
    return;
  }

  if (args.length === 0) {
    await ctx.reply('Gunakan format:\n/reseller on\nPesan: jika on maka user yang tidak ada dalam database tidak bisa akses bot dan input masa aktif cuma bisa kelipatan 30 hari. silahkan daftarkan user dengan command yang sudah disediakan\n\n/reseller off\nPesan: user otomatis bisa akses bot tanpa registrasi');
    return;
  }

  const mode = args[0].toLowerCase();

  if (mode === 'on' || mode === 'off') {
    db.run('INSERT OR REPLACE INTO lainnya (key, value) VALUES (?, ?)', ['reseller', mode], (err) => {
      if (err) {
        console.error('Gagal mengubah mode reseller:', err.message);
        ctx.reply('❌ Terjadi kesalahan saat mengubah mode reseller.');
      } else {
        ctx.reply(`✅ Mode reseller berhasil diubah menjadi *${mode.toUpperCase()}*.`, { parse_mode: 'Markdown' });
      }
    });
  } else {
    await ctx.reply('❌ Argumen tidak valid. Gunakan:\n/reseller on\n/reseller off');
  }
});

bot.command('reg', async (ctx) => {
  const adminId = ctx.from.id;

  if (!adminIds.includes(adminId)) {
    await ctx.reply('🚫 Anda tidak memiliki izin untuk menjalankan perintah ini.');
    return;
  }

  const args = ctx.message.text.split(' ').slice(1);

  if (args.length !== 2) {
    await ctx.reply('❌ Format salah. Gunakan:\n/reg <id> <saldo>');
    return;
  }

  const userId = parseInt(args[0]);
  const saldo = parseInt(args[1]);

  if (isNaN(userId) || isNaN(saldo)) {
    await ctx.reply('❌ ID dan saldo harus berupa angka.');
    return;
  }

  db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
    if (err) {
      console.error('Kesalahan saat memeriksa user:', err.message);
      ctx.reply('❌ Terjadi kesalahan saat mengakses database.');
      return;
    }

    if (row) {
      ctx.reply('⚠️ User sudah terdaftar.');
    } else {
      db.run('INSERT INTO users (user_id, saldo) VALUES (?, ?)', [userId, saldo], (err) => {
        if (err) {
          console.error('Kesalahan saat menyimpan user:', err.message);
          ctx.reply('❌ Gagal menyimpan user.');
        } else {
          ctx.reply(`✅ User ID ${userId} berhasil didaftarkan dengan saldo ${saldo}.`);
        }
      });
    }
  });
});

bot.command('admin', async (ctx) => {
  console.log('Admin menu requested');
  
  if (!adminIds.includes(ctx.from.id)) {
    await ctx.reply('🚫 Anda tidak memiliki izin untuk mengakses menu admin.');
    return;
  }

  await sendAdminMenu(ctx);
});

bot.command('addlogoqris', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) {
    return ctx.reply('🚫 Anda tidak memiliki izin untuk menjalankan perintah ini.');
  }

  const args = ctx.message.text.split(' ');
  if (args.length < 2 || !args[1].startsWith('http')) {
    return ctx.reply('❗ Gunakan format yang benar: /addlogoqris http://example.com/logo.png\nPesan: jika diaktifkan maka logo pada link yang kalian input akan muncul di tengah qris saat deposit');
  }

  const logoUrl = args[1].trim();

  try {
    db.run('INSERT OR REPLACE INTO lainnya (key, value) VALUES (?, ?)', ['logoqris', logoUrl], function(err) {
      if (err) {
        console.error('Gagal menyimpan logo:', err.message);
        return ctx.reply('❌ Gagal menyimpan logo.');
      }
      ctx.reply('✅ Logo QRIS berhasil ditambahkan!');
    });
  } catch (err) {
    console.error('Gagal menyimpan logo:', err.message);
    await ctx.reply('❌ Gagal menyimpan logo.');
  }
});

bot.command('offlogo', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) {
    return ctx.reply('🚫 Anda tidak memiliki izin untuk menjalankan perintah ini.');
  }

  try {
    db.run('DELETE FROM lainnya WHERE key = "logoqris"', [], function(err) {
      if (err) {
        console.error('Gagal menghapus logo:', err.message);
        return ctx.reply('❌ Gagal menghapus logo.');
      }
      
      if (this.changes > 0) {
        ctx.reply('✅ Logo QRIS berhasil dihapus.');
      } else {
        ctx.reply('⚠️ Tidak ada logo yang disimpan saat ini.');
      }
    });
  } catch (err) {
    console.error('Gagal menghapus logo:', err.message);
    await ctx.reply('❌ Gagal menghapus logo.');
  }
});

bot.command('mintopup', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) {
    await ctx.reply('🚫 Anda tidak memiliki izin untuk mengakses perintah ini.');
    return;
  }

  const args = ctx.message.text.split(' ').slice(1);
  const newLimit = args[0];

  if (!newLimit || isNaN(newLimit) || parseInt(newLimit) <= 0) {
    return ctx.reply('⚠️ *Format salah.*\n\nContoh penggunaan:\n`/mintopup 2000`\nPesan: untuk mengubah minimal deposit (bawaan minimal 100)', { 
      parse_mode: 'Markdown' 
    });
  }

  try {
    db.run(
      'INSERT OR REPLACE INTO lainnya (key, value) VALUES (?, ?)',
      ['mintopup', newLimit],
      function(err) {
        if (err) {
          console.error('Gagal mengubah minimal topup:', err.message);
          return ctx.reply('❌ *Gagal mengubah minimal top up*', { 
            parse_mode: 'Markdown' 
          });
        }
        
        ctx.reply(`✅ *Minimal top up berhasil diubah menjadi ${newLimit}*`, { 
          parse_mode: 'Markdown' 
        });
      }
    );
  } catch (err) {
    console.error('Gagal mengubah minimal topup:', err.message);
    await ctx.reply('❌ *Gagal mengubah minimal top up*', { 
      parse_mode: 'Markdown' 
    });
  }
});

bot.command('settrial', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) {
    await ctx.reply('🚫 Anda tidak memiliki izin untuk mengakses perintah ini.');
    return;
  }

  const args = ctx.message.text.split(' ').slice(1);
  const newLimit = args[0];

  if (!newLimit || isNaN(newLimit) || parseInt(newLimit) <= 0) {
    return ctx.reply('⚠️ *Format salah.*\n\nContoh penggunaan:\n`/settrial 2`', { parse_mode: 'Markdown' });
  }

  try {
    db.run('INSERT OR REPLACE INTO lainnya (key, value) VALUES (?, ?)', ['triallimit', newLimit], function(err) {
      if (err) {
        console.error('Gagal mengubah trial limit:', err.message);
        return ctx.reply('❌ *Gagal mengubah trial limit.*', { parse_mode: 'Markdown' });
      }
      ctx.reply(`✅ *Trial limit berhasil diubah menjadi ${newLimit}x percobaan per 24 jam.*`, { parse_mode: 'Markdown' });
    });
  } catch (err) {
    console.error('Gagal mengubah trial limit:', err.message);
    await ctx.reply('❌ *Gagal mengubah trial limit.*', { parse_mode: 'Markdown' });
  }
});

bot.command('infolimit', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) {
    await ctx.reply('🚫 Anda tidak memiliki izin untuk mengakses perintah ini.');
    return;
  }

  try {
    db.get('SELECT value FROM lainnya WHERE key = "triallimit"', [], async (err, row) => {
      let trialLimit = 1;

      if (!err && row && row.value && !isNaN(row.value)) {
        trialLimit = parseInt(row.value);
      }

      await ctx.reply(
        `📋 *Trial limit saat ini adalah ${trialLimit}x percobaan per 24 jam.*`,
        { parse_mode: 'Markdown' }
      );
    });
  } catch (err) {
    console.error('Gagal membaca trial limit:', err.message);
    await ctx.reply('❌ *Gagal membaca trial limit.*', { parse_mode: 'Markdown' });
  }
});

function generateRandomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

bot.command('bkp', async (ctx) => {
  const userId = ctx.from.id;

  if (!adminIds.includes(userId)) {
    return ctx.reply('🚫 Anda tidak memiliki izin untuk mengakses perintah ini.');
  }

  const originalPath = path.join(__dirname, 'sellvpn.db');

  if (!fs.existsSync(originalPath)) {
    return ctx.reply('❌ File database tidak ditemukan.');
  }

  const randomStr = generateRandomString(10);
  const customFilename = `sellvpn.db_${randomStr}`;

  try {
    await ctx.replyWithDocument({ source: originalPath, filename: customFilename });
    console.log(`✅ File backup dikirim dengan nama ${customFilename}`);
  } catch (error) {
    console.error('❌ Gagal mengirim file backup:', error.message);
    await ctx.reply('❌ Terjadi kesalahan saat mengirim file backup.');
  }
});

bot.command('helpadmin', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const helpMessage = `
*📋 Daftar Perintah Admin:*

1. /addserver - Menambahkan server baru.
2. /addsaldo - Menambahkan saldo ke akun pengguna.
3. /editharga - Mengedit harga layanan.
4. /editnama - Mengedit nama server.
5. /editdomain - Mengedit domain server.
6. /editauth - Mengedit auth server.
7. /editlimitquota - Mengedit batas quota server.
8. /editlimitip - Mengedit batas IP server.
9. /editlimitcreate - Mengedit batas pembuatan akun server.
10. /edittotalcreate - Mengedit total pembuatan akun server.
11. /broadcast - Mengirim pesan siaran ke semua pengguna.
12. /bkp - Backup database saat ini.
13. /settrial - batas limit trial harian
14. /infolimit - cek limit trial saat ini
15. /mintopup - set minimal top up
16. /minsaldo - untuk mengurangi saldo pengguna
17. /addlogoqris - untuk menambah logo pada qris
18. /offlogo - untuk menghapus logo qris
19. /reseller - untuk mengubah bot ke mode reseller
20. /reg - untuk mendaftarkan reseller (reseller on)
21. /blokir - untuk memblokir akses user ke bot
22. /unblokir - untuk membuka user yang di blokir
23. /minbuy - untuk mengubah kelipatan pembelian dalam hari (reseller on)
24. /setidnotif - untuk mengganti id notifikasi 
25. /payment - informasi saldo dan informasi tarik saldo order kuota 
Gunakan perintah ini dengan format yang benar untuk menghindari kesalahan.
`;

  ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});

bot.command('broadcast', async (ctx) => {
  const userId = ctx.message.from.id;
  console.log(`Broadcast command received from user_id: ${userId}`);

  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
  }

  if (!ctx.message.reply_to_message) {
    return ctx.reply(
      '📢 <b>Untuk mengirim broadcast, balas pesan dengan</b> <code>/broadcast</code>\n\n' +
      '<b>Contoh:</b>\n' +
      '1. Ketik pesan yang ingin di-broadcast\n' +
      '2. Balas pesan tersebut dengan <code>/broadcast</code>\n\n' +
      '⚡ <b>Fitur:</b> Broadcast berjalan di background thread sehingga tidak mengganggu bot',
      { parse_mode: 'HTML' }
    );
  }

  // Kirim status awal
  const statusMessage = await ctx.reply(
    '🔄 <b>Memulai broadcast di background thread...</b>\n' +
    '📊 Bot tetap responsif selama proses broadcast\n' +
    '⏳ Mohon tunggu laporan akhir nanti...',
    { parse_mode: 'HTML' }
  );

  // Jalankan broadcast di background
  runBroadcastInBackground(ctx, statusMessage);
});

// Fungsi untuk menjalankan broadcast di background
async function runBroadcastInBackground(ctx, statusMessage) {
  try {
    const repliedMessage = ctx.message.reply_to_message;
    
    // Dapatkan semua user dari database
    const users = await new Promise((resolve, reject) => {
      db.all("SELECT user_id FROM users", [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const totalUsers = users.length;
    
    if (totalUsers === 0) {
      await ctx.telegram.editMessageText(
        statusMessage.chat.id,
        statusMessage.message_id,
        null,
        '❌ <b>Tidak ada user yang dapat menerima broadcast.</b>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Update status awal
    await ctx.telegram.editMessageText(
      statusMessage.chat.id,
      statusMessage.message_id,
      null,
      '📢 <b>Broadcast sedang berjalan di background...</b>\n' +
      `👥 <b>Total User:</b> ${totalUsers}\n` +
      '⏱️ <b>Delay:</b> 2 detik/pesan\n\n' +
      '💡 <i>Bot tetap bisa digunakan untuk command lain</i>',
      { parse_mode: 'HTML' }
    );

    let successCount = 0;
    let failCount = 0;
    let failedUsers = [];
    const DELAY_SECONDS = 200; // 2 detik dalam milidetik

    // Deteksi tipe pesan
    const isForward = repliedMessage.forward_origin !== undefined;
    const isPoll = repliedMessage.poll !== undefined;

    // Kirim broadcast ke semua user dengan delay
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      
      try {
        // Delay antara setiap pengiriman (kecuali pesan pertama)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, DELAY_SECONDS));
        }

        // Update progress setiap 20 pesan
        if (i % 20 === 0 || i === users.length - 1) {
          await ctx.telegram.editMessageText(
            statusMessage.chat.id,
            statusMessage.message_id,
            null,
            '📢 <b>Broadcast sedang berjalan...</b>\n' +
            `📊 <b>Progress:</b> ${i + 1}/${totalUsers}\n` +
            `✅ <b>Berhasil:</b> ${successCount}\n` +
            `❌ <b>Gagal:</b> ${failCount}\n` +
            `⏱️ <b>Estimasi selesai:</b> ${Math.round((totalUsers - i - 1) * DELAY_SECONDS / 1000)} detik\n\n` +
            '💡 <i>Bot tetap bisa digunakan dalam proses ini</i>',
            { parse_mode: 'HTML' }
          );
        }

        // Handle Poll Message
        if (isPoll) {
          const poll = repliedMessage.poll;
          await ctx.telegram.sendPoll(
            user.user_id,
            poll.question,
            poll.options.map(opt => opt.text),
            {
              is_anonymous: poll.is_anonymous,
              allows_multiple_answers: poll.allows_multiple_answers,
              reply_markup: repliedMessage.reply_markup
            }
          );
        }
        // Handle Forward Message - gunakan forwardMessage
        else if (isForward) {
          try {
            await ctx.telegram.forwardMessage(
              user.user_id,
              ctx.chat.id,
              repliedMessage.message_id
            );
          } catch (forwardError) {
            // Fallback ke copyMessage jika forward gagal
            await ctx.telegram.copyMessage(
              user.user_id,
              ctx.chat.id,
              repliedMessage.message_id,
              { reply_markup: repliedMessage.reply_markup }
            );
          }
        }
        // Handle Regular Message - gunakan copyMessage untuk pertahankan format
        else {
          await ctx.telegram.copyMessage(
            user.user_id,
            ctx.chat.id,
            repliedMessage.message_id,
            { reply_markup: repliedMessage.reply_markup }
          );
        }

        successCount++;
        console.log(`✅ Pesan broadcast dikirim ke ${user.user_id}`);

      } catch (error) {
        failCount++;
        failedUsers.push(`${user.user_id}: ${error.message}`);
        console.error(`⚠️ Gagal kirim ke ${user.user_id}:`, error.message);
      }
    }

    // Hitung success rate
    const successRate = totalUsers > 0 ? (successCount / totalUsers * 100) : 0;

    // Buat laporan akhir
    let reportText = 
      '✅ <b>Broadcast Selesai!</b>\n\n' +
      '📊 <b>Laporan Detail:</b>\n' +
      `• 👥 <b>Total Target:</b> ${totalUsers} user\n` +
      `• ✅ <b>Berhasil:</b> ${successCount} user\n` +
      `• ❌ <b>Gagal:</b> ${failCount} user\n` +
      `• 📈 <b>Success Rate:</b> ${successRate.toFixed(1)}%\n`;

    // Tambahkan info mode pengiriman
    if (isPoll) {
      reportText += '• 📊 <b>Mode:</b> <code>POLL</code>\n';
    } else if (isForward) {
      reportText += '• 📤 <b>Mode:</b> <code>FORWARD</code>\n';
    } else {
      reportText += '• 📝 <b>Mode:</b> <code>REGULAR</code>\n';
    }

    reportText += 
      '\n⏱️ <b>Pengaturan:</b>\n' +
      `• <b>Delay:</b> ${DELAY_SECONDS / 1000} detik/pesan`;

    // Tambahkan detail error jika ada yang gagal
    if (failCount > 0) {
      const showFailCount = Math.min(failCount, 3);
      reportText += `\n\n❌ <b>Gagal (${showFailCount} dari ${failCount}):</b>\n`;
      for (let j = 0; j < Math.min(failedUsers.length, 3); j++) {
        reportText += `${j + 1}. <code>${failedUsers[j]}</code>\n`;
      }
      if (failCount > 3) {
        reportText += `... dan ${failCount - 3} lainnya`;
      }
    }

    // Edit pesan status dengan laporan akhir
    await ctx.telegram.editMessageText(
      statusMessage.chat.id,
      statusMessage.message_id,
      null,
      reportText,
      { parse_mode: 'HTML' }
    );

  } catch (error) {
    console.error('❌ Error dalam broadcast:', error);
    
    // Kirim error message
    await ctx.telegram.editMessageText(
      statusMessage.chat.id,
      statusMessage.message_id,
      null,
      `❌ <b>Error dalam broadcast:</b>\n<code>${error.message}</code>`,
      { parse_mode: 'HTML' }
    );
  }
}

// Function untuk delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

bot.command('addsaldo', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/addsaldo <user_id> <jumlah>`', { parse_mode: 'Markdown' });
  }

  const targetUserId = parseInt(args[1]);
  const amount = parseInt(args[2]);

  if (isNaN(targetUserId) || isNaN(amount)) {
    return ctx.reply('⚠️ `user_id` dan `jumlah` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  if (/\s/.test(args[1]) || /\./.test(args[1]) || /\s/.test(args[2]) || /\./.test(args[2])) {
    return ctx.reply('⚠️ `user_id` dan `jumlah` tidak boleh mengandung spasi atau titik.', { parse_mode: 'Markdown' });
  }

  db.get("SELECT * FROM users WHERE user_id = ?", [targetUserId], (err, row) => {
    if (err) {
      console.error('⚠️ Kesalahan saat memeriksa `user_id`:', err.message);
      return ctx.reply('⚠️ Kesalahan saat memeriksa `user_id`.', { parse_mode: 'Markdown' });
    }

    if (!row) {
      return ctx.reply('⚠️ `user_id` tidak terdaftar.', { parse_mode: 'Markdown' });
    }

    db.run("UPDATE users SET saldo = saldo + ? WHERE user_id = ?", [amount, targetUserId], function(err) {
      if (err) {
        console.error('⚠️ Kesalahan saat menambahkan saldo:', err.message);
        return ctx.reply('⚠️ Kesalahan saat menambahkan saldo.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
        return ctx.reply('⚠️ Pengguna tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Saldo sebesar \`${amount}\` berhasil ditambahkan untuk \`user_id\` \`${targetUserId}\`.`, { parse_mode: 'Markdown' });
    });
  });
});

bot.command('minsaldo', async (ctx) => { 
  const userId = ctx.message.from.id;

  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');

  if (args.length !== 3) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/minsaldo <user_id> <jumlah>`', { parse_mode: 'Markdown' });
  }

  const targetUserId = parseInt(args[1]);
  const amount = parseInt(args[2]);

  if (isNaN(targetUserId) || isNaN(amount)) {
    return ctx.reply('⚠️ `user_id` dan `jumlah` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  if (/\s/.test(args[1]) || /\./.test(args[1]) || /\s/.test(args[2]) || /\./.test(args[2])) {
    return ctx.reply('⚠️ `user_id` dan `jumlah` tidak boleh mengandung spasi atau titik.', { parse_mode: 'Markdown' });
  }

  db.get("SELECT * FROM users WHERE user_id = ?", [targetUserId], (err, row) => {
    if (err) {
      console.error('⚠️ Kesalahan saat memeriksa `user_id`:', err.message);
      return ctx.reply('⚠️ Kesalahan saat memeriksa `user_id`.', { parse_mode: 'Markdown' });
    }

    if (!row) {
      return ctx.reply('⚠️ `user_id` tidak terdaftar.', { parse_mode: 'Markdown' });
    }

    if (row.saldo < amount) {
      return ctx.reply('⚠️ Saldo pengguna tidak mencukupi untuk dikurangi.', { parse_mode: 'Markdown' });
    }

    db.run("UPDATE users SET saldo = saldo - ? WHERE user_id = ?", [amount, targetUserId], function(err) {
      if (err) {
        console.error('⚠️ Kesalahan saat mengurangi saldo:', err.message);
        return ctx.reply('⚠️ Kesalahan saat mengurangi saldo.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
        return ctx.reply('⚠️ Pengguna tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Saldo sebesar \`${amount}\` berhasil dikurangi dari \`user_id\` \`${targetUserId}\`.`, { parse_mode: 'Markdown' });
    });
  });
});

bot.command('addserver', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 7) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/addserver <domain> <auth> <harga> <nama_server> <quota> <iplimit> <batas_create_account>`', { parse_mode: 'Markdown' });
  }

  const [domain, auth, harga, nama_server, quota, iplimit, batas_create_akun] = args.slice(1);

  const numberOnlyRegex = /^\d+$/;
  if (!numberOnlyRegex.test(harga) || !numberOnlyRegex.test(quota) || !numberOnlyRegex.test(iplimit) || !numberOnlyRegex.test(batas_create_akun)) {
    return ctx.reply('⚠️ `harga`, `quota`, `iplimit`, dan `batas_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("INSERT INTO Server (domain, auth, harga, nama_server, quota, iplimit, batas_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?)", 
    [domain, auth, parseInt(harga), nama_server, parseInt(quota), parseInt(iplimit), parseInt(batas_create_akun)], function(err) {
    if (err) {
      console.error('⚠️ Kesalahan saat menambahkan server:', err.message);
      return ctx.reply('⚠️ Kesalahan saat menambahkan server.', { parse_mode: 'Markdown' });
    }

    ctx.reply(`✅ Server \`${nama_server}\` berhasil ditambahkan.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editharga', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/editharga <domain> <harga>`', { parse_mode: 'Markdown' });
  }

  const [domain, harga] = args.slice(1);

  if (!/^\d+$/.test(harga)) {
    return ctx.reply('⚠️ `harga` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET harga = ? WHERE domain = ?", [parseInt(harga), domain], function(err) {
    if (err) {
      console.error('⚠️ Kesalahan saat mengedit harga server:', err.message);
      return ctx.reply('⚠️ Kesalahan saat mengedit harga server.', { parse_mode: 'Markdown' });
    }

    if (this.changes === 0) {
      return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
    }

    ctx.reply(`✅ Harga server \`${domain}\` berhasil diubah menjadi \`${harga}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editnama', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/editnama <domain> <nama_server>`', { parse_mode: 'Markdown' });
  }

  const [domain, nama_server] = args.slice(1);

  db.run("UPDATE Server SET nama_server = ? WHERE domain = ?", [nama_server, domain], function(err) {
    if (err) {
      console.error('⚠️ Kesalahan saat mengedit nama server:', err.message);
      return ctx.reply('⚠️ Kesalahan saat mengedit nama server.', { parse_mode: 'Markdown' });
    }

    if (this.changes === 0) {
      return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
    }

    ctx.reply(`✅ Nama server \`${domain}\` berhasil diubah menjadi \`${nama_server}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editdomain', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/editdomain <old_domain> <new_domain>`', { parse_mode: 'Markdown' });
  }

  const [old_domain, new_domain] = args.slice(1);

  db.run("UPDATE Server SET domain = ? WHERE domain = ?", [new_domain, old_domain], function(err) {
    if (err) {
      console.error('⚠️ Kesalahan saat mengedit domain server:', err.message);
      return ctx.reply('⚠️ Kesalahan saat mengedit domain server.', { parse_mode: 'Markdown' });
    }

    if (this.changes === 0) {
      return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
    }

    ctx.reply(`✅ Domain server \`${old_domain}\` berhasil diubah menjadi \`${new_domain}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editauth', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/editauth <domain> <auth>`', { parse_mode: 'Markdown' });
  }

  const [domain, auth] = args.slice(1);

  db.run("UPDATE Server SET auth = ? WHERE domain = ?", [auth, domain], function(err) {
    if (err) {
      console.error('⚠️ Kesalahan saat mengedit auth server:', err.message);
      return ctx.reply('⚠️ Kesalahan saat mengedit auth server.', { parse_mode: 'Markdown' });
    }

    if (this.changes === 0) {
      return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
    }

    ctx.reply(`✅ Auth server \`${domain}\` berhasil diubah menjadi \`${auth}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editlimitquota', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitquota <domain> <quota>`', { parse_mode: 'Markdown' });
  }

  const [domain, quota] = args.slice(1);

  if (!/^\d+$/.test(quota)) {
    return ctx.reply('⚠️ `quota` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET quota = ? WHERE domain = ?", [parseInt(quota), domain], function(err) {
    if (err) {
      console.error('⚠️ Kesalahan saat mengedit quota server:', err.message);
      return ctx.reply('⚠️ Kesalahan saat mengedit quota server.', { parse_mode: 'Markdown' });
    }

    if (this.changes === 0) {
      return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
    }

    ctx.reply(`✅ Quota server \`${domain}\` berhasil diubah menjadi \`${quota}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editlimitip', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitip <domain> <iplimit>`', { parse_mode: 'Markdown' });
  }

  const [domain, iplimit] = args.slice(1);

  if (!/^\d+$/.test(iplimit)) {
    return ctx.reply('⚠️ `iplimit` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET iplimit = ? WHERE domain = ?", [parseInt(iplimit), domain], function(err) {
    if (err) {
      console.error('⚠️ Kesalahan saat mengedit iplimit server:', err.message);
      return ctx.reply('⚠️ Kesalahan saat mengedit iplimit server.', { parse_mode: 'Markdown' });
    }

    if (this.changes === 0) {
      return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
    }

    ctx.reply(`✅ Iplimit server \`${domain}\` berhasil diubah menjadi \`${iplimit}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editlimitcreate', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitcreate <domain> <batas_create_akun>`', { parse_mode: 'Markdown' });
  }

  const [domain, batas_create_akun] = args.slice(1);

  if (!/^\d+$/.test(batas_create_akun)) {
    return ctx.reply('⚠️ `batas_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET batas_create_akun = ? WHERE domain = ?", [parseInt(batas_create_akun), domain], function(err) {
    if (err) {
      console.error('⚠️ Kesalahan saat mengedit batas_create_akun server:', err.message);
      return ctx.reply('⚠️ Kesalahan saat mengedit batas_create_akun server.', { parse_mode: 'Markdown' });
    }

    if (this.changes === 0) {
      return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
    }

    ctx.reply(`✅ Batas create akun server \`${domain}\` berhasil diubah menjadi \`${batas_create_akun}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('edittotalcreate', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/edittotalcreate <domain> <total_create_akun>`', { parse_mode: 'Markdown' });
  }

  const [domain, total_create_akun] = args.slice(1);

  if (!/^\d+$/.test(total_create_akun)) {
    return ctx.reply('⚠️ `total_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET total_create_akun = ? WHERE domain = ?", [parseInt(total_create_akun), domain], function(err) {
    if (err) {
      console.error('⚠️ Kesalahan saat mengedit total_create_akun server:', err.message);
      return ctx.reply('⚠️ Kesalahan saat mengedit total_create_akun server.', { parse_mode: 'Markdown' });
    }

    if (this.changes === 0) {
        return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
    }

    ctx.reply(`✅ Total create akun server \`${domain}\` berhasil diubah menjadi \`${total_create_akun}\`.`, { parse_mode: 'Markdown' });
  });
});

// Service Menu Handlers
async function handleServiceAction(ctx, action) {
  let keyboard;
  if (action === 'create') {
    keyboard = [
      [{ text: 'CREATE SSH', callback_data: 'create_ssh' }, { text: 'CREATE VMESS', callback_data: 'create_vmess' }],      
      [{ text: 'CREATE VLESS', callback_data: 'create_vless' }, { text: 'CREATE TROJAN', callback_data: 'create_trojan' }],      
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  } else if (action === 'renew') {
    keyboard = [
      [{ text: 'RENEW SSH', callback_data: 'renew_ssh' }, { text: 'RENEW VMESS', callback_data: 'renew_vmess' }],      
      [{ text: 'RENEW VLESS', callback_data: 'renew_vless' }, { text: 'RENEW TROJAN', callback_data: 'renew_trojan' }],      
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  }  else if (action === 'trial') {
    keyboard = [
      [{ text: 'TRIAL SSH', callback_data: 'trial_ssh' }, { text: 'TRIAL VMESS', callback_data: 'trial_vmess' }],      
      [{ text: 'TRIAL VLESS', callback_data: 'trial_vless' }, { text: 'TRIAL TROJAN', callback_data: 'trial_trojan' }],      
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  } 
  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: keyboard
    });
    console.log(`${action} service menu sent`);
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      await ctx.reply(`Pilih jenis layanan yang ingin Anda ${action}:`, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
      console.log(`${action} service menu sent as new message`);
    } else {
      console.error(`Error saat mengirim menu ${action}:`, error);
    }
  }
}

async function sendAdminMenu(ctx) {
  const adminKeyboard = [
    [
      { text: '➕ Tambah Server', callback_data: 'addserver' },
      { text: '❌ Hapus Server', callback_data: 'deleteserver' }
    ],
    [
      { text: '💲 Edit Harga', callback_data: 'editserver_harga' },
      { text: '📝 Edit Nama', callback_data: 'nama_server_edit' }
    ],
    [
      { text: '🌐 Edit Domain', callback_data: 'editserver_domain' },
      { text: '🔑 Edit Auth', callback_data: 'editserver_auth' }
    ],
    [
      { text: '📊 Edit Quota', callback_data: 'editserver_quota' },
      { text: '📶 Edit Limit IP', callback_data: 'editserver_limit_ip' }
    ],
    [
      { text: '🔢 Edit Batas Create', callback_data: 'editserver_batas_create_akun' },
      { text: '🔢 Edit Total Create', callback_data: 'editserver_total_create_akun' }
    ],
    [
      { text: '💵 Tambah Saldo', callback_data: 'addsaldo_user' },
      { text: '📋 List Server', callback_data: 'listserver' }
    ],
    [
      { text: '♻️ Reset Server', callback_data: 'resetdb' },
      { text: 'ℹ️ Detail Server', callback_data: 'detailserver' }
    ],
    [
      { text: '🔙 Kembali', callback_data: 'send_main_menu' }
    ]
  ];

  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: adminKeyboard
    });
    console.log('Admin menu sent');
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      await ctx.reply('Menu Admin:', {
        reply_markup: {
          inline_keyboard: adminKeyboard
        }
      });
      console.log('Admin menu sent as new message');
    } else {
      console.error('Error saat mengirim menu admin:', error);
    }
  }
}

// Action Handlers untuk tombol admin
bot.action('addserver', async (ctx) => {
  try {
    console.log('📥 Proses tambah server dimulai');
    await ctx.answerCbQuery();
    await ctx.reply('🌐 *Silakan masukkan domain/ip server:*', { parse_mode: 'Markdown' });
    stateManager.setState(ctx.chat.id, { step: 'addserver' });
  } catch (error) {
    console.error('❌ Kesalahan saat memulai proses tambah server:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});

bot.action('deleteserver', async (ctx) => {
  try {
    console.log('🗑️ Proses hapus server dimulai');
    await ctx.answerCbQuery();
    
    db.all('SELECT * FROM Server', [], (err, servers) => {
      if (err) {
        console.error('⚠️ Kesalahan saat mengambil daftar server:', err.message);
        return ctx.reply('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*', { parse_mode: 'Markdown' });
      }

      if (servers.length === 0) {
        console.log('⚠️ Tidak ada server yang tersedia');
        return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
      }

      const keyboard = servers.map(server => {
        return [{ text: server.nama_server, callback_data: `confirm_delete_server_${server.id}` }];
      });
      keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);

      ctx.reply('🗑️ *Pilih server yang ingin dihapus:*', {
        reply_markup: {
          inline_keyboard: keyboard
        },
        parse_mode: 'Markdown'
      });
    });
  } catch (error) {
    console.error('❌ Kesalahan saat memulai proses hapus server:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_harga', async (ctx) => {
  try {
    console.log('Edit server harga process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_harga_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('💰 *Silakan pilih server untuk mengedit harga:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('❌ Kesalahan saat memulai proses edit harga server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('nama_server_edit', async (ctx) => {
  try {
    console.log('Edit server nama process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_nama_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('🏷️ *Silakan pilih server untuk mengedit nama:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('❌ Kesalahan saat memulai proses edit nama server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_domain', async (ctx) => {
  try {
    console.log('Edit server domain process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_domain_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('🌐 *Silakan pilih server untuk mengedit domain:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('❌ Kesalahan saat memulai proses edit domain server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_auth', async (ctx) => {
  try {
    console.log('Edit server auth process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_auth_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('🌐 *Silakan pilih server untuk mengedit auth:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('❌ Kesalahan saat memulai proses edit auth server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_quota', async (ctx) => {
  try {
    console.log('Edit server quota process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_quota_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit quota:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('❌ Kesalahan saat memulai proses edit quota server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_limit_ip', async (ctx) => {
  try {
    console.log('Edit server limit IP process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_limit_ip_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit limit IP:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('❌ Kesalahan saat memulai proses edit limit IP server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_batas_create_akun', async (ctx) => {
  try {
    console.log('Edit server batas create akun process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_batas_create_akun_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit batas create akun:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('❌ Kesalahan saat memulai proses edit batas create akun server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_total_create_akun', async (ctx) => {
  try {
    console.log('Edit server total create akun process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_total_create_akun_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit total create akun:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('❌ Kesalahan saat memulai proses edit total create akun server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('addsaldo_user', async (ctx) => {
  try {
    console.log('Add saldo user process started');
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all('SELECT id, user_id FROM users LIMIT 20', [], (err, users) => {
        if (err) {
          console.error('❌ Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
        if (err) {
          console.error('❌ Kesalahan saat menghitung total user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat menghitung total user.*');
        }
        resolve(row.count);
      });
    });

    const buttons = [];
    for (let i = 0; i < users.length; i += 2) {
      const row = [];
      const username1 = await getUsernameById(users[i].user_id);
      row.push({
        text: username1 || users[i].user_id,
        callback_data: `add_saldo_${users[i].id}`
      });
      if (i + 1 < users.length) {
        const username2 = await getUsernameById(users[i + 1].user_id);
        row.push({
          text: username2 || users[i + 1].user_id,
          callback_data: `add_saldo_${users[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    const currentPage = 0;
    const replyMarkup = {
      inline_keyboard: [...buttons]
    };

    if (totalUsers > 20) {
      replyMarkup.inline_keyboard.push([{
        text: '➡️ Next',
        callback_data: `next_users_${currentPage + 1}`
      }]);
    }

    await ctx.reply('📊 *Silakan pilih user untuk menambahkan saldo:*', {
      reply_markup: replyMarkup,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('❌ Kesalahan saat memulai proses tambah saldo user:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('listserver', async (ctx) => {
  try {
    console.log('📜 Proses daftar server dimulai');
    await ctx.answerCbQuery();
    
    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM Server', [], (err, servers) => {
        if (err) {
          console.error('⚠️ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      console.log('⚠️ Tidak ada server yang tersedia');
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
    }

    let serverList = '📜 *Daftar Server* 📜\n\n';
    servers.forEach((server, index) => {
      serverList += `🔹 ${index + 1}. ${server.domain}\n`;
    });

    serverList += `\nTotal Jumlah Server: ${servers.length}`;

    await ctx.reply(serverList, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('⚠️ Kesalahan saat mengambil daftar server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil daftar server.*', { parse_mode: 'Markdown' });
  }
});

bot.action('resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('🚨 *PERHATIAN! Anda akan menghapus semua server yang tersedia. Apakah Anda yakin?*', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Ya', callback_data: 'confirm_resetdb' }],
          [{ text: '❌ Tidak', callback_data: 'cancel_resetdb' }]
        ]
      },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('❌ Error saat memulai proses reset database:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('detailserver', async (ctx) => {
  try {
    console.log('📋 Proses detail server dimulai');
    await ctx.answerCbQuery();
    
    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM Server', [], (err, servers) => {
        if (err) {
          console.error('⚠️ Kesalahan saat mengambil detail server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil detail server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      console.log('⚠️ Tidak ada server yang tersedia');
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
    }

    const buttons = [];
    for (let i = 0; i < servers.length; i += 2) {
      const row = [];
      row.push({
        text: `${servers[i].nama_server}`,
        callback_data: `server_detail_${servers[i].id}`
      });
      if (i + 1 < servers.length) {
        row.push({
          text: `${servers[i + 1].nama_server}`,
          callback_data: `server_detail_${servers[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    await ctx.reply('📋 *Silakan pilih server untuk melihat detail:*', {
      reply_markup: { inline_keyboard: buttons },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('⚠️ Kesalahan saat mengambil detail server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
  }
});

// Helper function untuk mendapatkan username
const getUsernameById = async (userId) => {
  try {
    const telegramUser = await bot.telegram.getChat(userId);
    return telegramUser.username || telegramUser.first_name;
  } catch (err) {
    console.error('❌ Kesalahan saat mengambil username dari Telegram:', err.message);
    return userId.toString();
  }
};

// Action Handlers untuk navigasi user
bot.action(/next_users_(\d+)/, async (ctx) => {
  const currentPage = parseInt(ctx.match[1]);
  const offset = currentPage * 20;

  try {
    console.log(`Next users process started for page ${currentPage + 1}`);
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all(`SELECT id, user_id FROM users LIMIT 20 OFFSET ${offset}`, [], (err, users) => {
        if (err) {
          console.error('❌ Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
        if (err) {
          console.error('❌ Kesalahan saat menghitung total user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat menghitung total user.*');
        }
        resolve(row.count);
      });
    });

    const buttons = [];
    for (let i = 0; i < users.length; i += 2) {
      const row = [];
      const username1 = await getUsernameById(users[i].user_id);
      row.push({
        text: username1 || users[i].user_id,
        callback_data: `add_saldo_${users[i].id}`
      });
      if (i + 1 < users.length) {
        const username2 = await getUsernameById(users[i + 1].user_id);
        row.push({
          text: username2 || users[i + 1].user_id,
          callback_data: `add_saldo_${users[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    const replyMarkup = {
      inline_keyboard: [...buttons]
    };

    const navigationButtons = [];
    if (currentPage > 0) {
      navigationButtons.push([{
        text: '⬅️ Back',
        callback_data: `prev_users_${currentPage - 1}`
      }]);
    }
    if (offset + 20 < totalUsers) {
      navigationButtons.push([{
        text: '➡️ Next',
        callback_data: `next_users_${currentPage + 1}`
      }]);
    }

    replyMarkup.inline_keyboard.push(...navigationButtons);

    await ctx.editMessageReplyMarkup(replyMarkup);
  } catch (error) {
    console.error('❌ Kesalahan saat memproses next users:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action(/prev_users_(\d+)/, async (ctx) => {
  const currentPage = parseInt(ctx.match[1]);
  const offset = (currentPage - 1) * 20; 

  try {
    console.log(`Previous users process started for page ${currentPage}`);
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all(`SELECT id, user_id FROM users LIMIT 20 OFFSET ${offset}`, [], (err, users) => {
        if (err) {
          console.error('❌ Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
        if (err) {
          console.error('❌ Kesalahan saat menghitung total user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat menghitung total user.*');
        }
        resolve(row.count);
      });
    });

    const buttons = [];
    for (let i = 0; i < users.length; i += 2) {
      const row = [];
      const username1 = await getUsernameById(users[i].user_id);
      row.push({
        text: username1 || users[i].user_id,
        callback_data: `add_saldo_${users[i].id}`
      });
      if (i + 1 < users.length) {
        const username2 = await getUsernameById(users[i + 1].user_id);
        row.push({
          text: username2 || users[i + 1].user_id,
          callback_data: `add_saldo_${users[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    const replyMarkup = {
      inline_keyboard: [...buttons]
    };

    const navigationButtons = [];
    if (currentPage > 0) {
      navigationButtons.push([{
        text: '⬅️ Back',
        callback_data: `prev_users_${currentPage - 1}`
      }]);
    }
    if (offset + 20 < totalUsers) {
      navigationButtons.push([{
        text: '➡️ Next',
        callback_data: `next_users_${currentPage}`
      }]);
    }

    replyMarkup.inline_keyboard.push(...navigationButtons);

    await ctx.editMessageReplyMarkup(replyMarkup);
  } catch (error) {
    console.error('❌ Kesalahan saat memproses previous users:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

// Action Handlers untuk konfirmasi
bot.action('confirm_resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM Server', (err) => {
        if (err) {
          console.error('❌ Error saat mereset tabel Server:', err.message);
          return reject('❗️ *PERHATIAN! Terjadi KESALAHAN SERIUS saat mereset database. Harap segera hubungi administrator!*');
        }
        resolve();
      });
    });
    await ctx.reply('🚨 *PERHATIAN! Database telah DIRESET SEPENUHNYA. Semua server telah DIHAPUS TOTAL.*', { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('❌ Error saat mereset database:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('cancel_resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('❌ *Proses reset database dibatalkan.*', { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('❌ Error saat membatalkan reset database:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action(/confirm_delete_server_(\d+)/, async (ctx) => {
  try {
    const serverId = ctx.match[1];
    await ctx.answerCbQuery();
    
    db.run('DELETE FROM Server WHERE id = ?', [serverId], function(err) {
      if (err) {
        console.error('Error deleting server:', err.message);
        return ctx.reply('⚠️ *PERHATIAN! Terjadi kesalahan saat menghapus server.*', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
        console.log('Server tidak ditemukan');
        return ctx.reply('⚠️ *PERHATIAN! Server tidak ditemukan.*', { parse_mode: 'Markdown' });
      }

      console.log(`Server dengan ID ${serverId} berhasil dihapus`);
      ctx.reply('✅ *Server berhasil dihapus.*', { parse_mode: 'Markdown' });
    });
  } catch (error) {
    console.error('Kesalahan saat menghapus server:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});

bot.action(/server_detail_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  try {
    const server = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
        if (err) {
          console.error('⚠️ Kesalahan saat mengambil detail server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil detail server.*');
        }
        resolve(server);
      });
    });

    if (!server) {
      console.log('⚠️ Server tidak ditemukan');
      return ctx.reply('⚠️ *PERHATIAN! Server tidak ditemukan.*', { parse_mode: 'Markdown' });
    }

    const serverDetails = `📋 *Detail Server* 📋\n\n` +
      `🌐 *Domain:* \`${server.domain}\`\n` +
      `🔑 *Auth:* \`${server.auth}\`\n` +
      `🏷️ *Nama Server:* \`${server.nama_server}\`\n` +
      `📊 *Quota:* \`${server.quota}\`\n` +
      `📶 *Limit IP:* \`${server.iplimit}\`\n` +
      `🔢 *Batas Create Akun:* \`${server.batas_create_akun}\`\n` +
      `📋 *Total Create Akun:* \`${server.total_create_akun}\`\n` +
      `💵 *Harga:* \`Rp ${server.harga}\`\n\n`;

    await ctx.reply(serverDetails, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('⚠️ Kesalahan saat mengambil detail server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
  }
});

// Action Handlers untuk edit server fields
bot.action(/edit_harga_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit harga server dengan ID: ${serverId}`);
  stateManager.setState(ctx.chat.id, { step: 'edit_harga', serverId: serverId });

  await ctx.reply('💰 *Silakan masukkan harga server baru:*', {
    parse_mode: 'Markdown'
  });
});

bot.action(/edit_nama_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit nama server dengan ID: ${serverId}`);
  stateManager.setState(ctx.chat.id, { step: 'edit_nama', serverId: serverId });

  await ctx.reply('🏷️ *Silakan masukkan nama server baru:*', {
    parse_mode: 'Markdown'
  });
});

bot.action(/edit_domain_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit domain server dengan ID: ${serverId}`);
  stateManager.setState(ctx.chat.id, { step: 'edit_domain', serverId: serverId });

  await ctx.reply('🌐 *Silakan masukkan domain server baru:*', {
    parse_mode: 'Markdown'
  });
});

bot.action(/edit_auth_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit auth server dengan ID: ${serverId}`);
  stateManager.setState(ctx.chat.id, { step: 'edit_auth', serverId: serverId });

  await ctx.reply('🌐 *Silakan masukkan auth server baru:*', {
    parse_mode: 'Markdown'
  });
});

bot.action(/edit_quota_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit quota server dengan ID: ${serverId}`);
  stateManager.setState(ctx.chat.id, { step: 'edit_quota', serverId: serverId });

  await ctx.reply('📊 *Silakan masukkan quota server baru:*', {
    parse_mode: 'Markdown'
  });
});

bot.action(/edit_limit_ip_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit limit IP server dengan ID: ${serverId}`);
  stateManager.setState(ctx.chat.id, { step: 'edit_limit_ip', serverId: serverId });

  await ctx.reply('📊 *Silakan masukkan limit IP server baru:*', {
    parse_mode: 'Markdown'
  });
});

bot.action(/edit_batas_create_akun_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit batas create akun server dengan ID: ${serverId}`);
  stateManager.setState(ctx.chat.id, { step: 'edit_batas_create_akun', serverId: serverId });

  await ctx.reply('📊 *Silakan masukkan batas create akun server baru:*', {
    parse_mode: 'Markdown'
  });
});

bot.action(/edit_total_create_akun_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit total create akun server dengan ID: ${serverId}`);
  stateManager.setState(ctx.chat.id, { step: 'edit_total_create_akun', serverId: serverId });

  await ctx.reply('📊 *Silakan masukkan total create akun server baru:*', {
    parse_mode: 'Markdown'
  });
});

bot.action(/add_saldo_(\d+)/, async (ctx) => {
  const userId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk menambahkan saldo user dengan ID: ${userId}`);
  stateManager.setState(ctx.chat.id, { step: 'add_saldo', userId: userId });

  await ctx.reply('📊 *Silakan masukkan jumlah saldo yang ingin ditambahkan:*', {
    parse_mode: 'Markdown'
  });
});

// Service Action Handlers
bot.action('service_create', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'create');
});

bot.action('service_renew', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'renew');
});

bot.action('service_trial', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'trial');
});

bot.action('send_main_menu', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await sendMainMenu(ctx);
});

// Server Selection
async function startSelectServer(ctx, action, type, page = 0) {
  try {
    console.log(`Memulai proses ${action} untuk ${type} di halaman ${page + 1}`);

    db.all('SELECT * FROM Server', [], (err, servers) => {
      if (err) {
        console.error('⚠️ Error fetching servers:', err.message);
        return ctx.reply('⚠️ *PERHATIAN!* Tidak ada server yang tersedia saat ini. Coba lagi nanti!', { parse_mode: 'Markdown' });
      }

      if (servers.length === 0) {
        console.log('Tidak ada server yang tersedia');
        return ctx.reply('⚠️ *PERHATIAN!* Tidak ada server yang tersedia saat ini. Coba lagi nanti!', { parse_mode: 'Markdown' });
      }

      const serversPerPage = 6;
      const totalPages = Math.ceil(servers.length / serversPerPage);
      const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
      const start = currentPage * serversPerPage;
      const end = start + serversPerPage;
      const currentServers = servers.slice(start, end);

      const keyboard = [];
      for (let i = 0; i < currentServers.length; i += 2) {
        const row = [];
        const server1 = currentServers[i];
        const server2 = currentServers[i + 1];
        const server1Text = `${server1.nama_server}`;
        row.push({ text: server1Text, callback_data: `${action}_username_${type}_${server1.id}` });

        if (server2) {
          const server2Text = `${server2.nama_server}`;
          row.push({ text: server2Text, callback_data: `${action}_username_${type}_${server2.id}` });
        }
        keyboard.push(row);
      }

      const navButtons = [];
      if (totalPages > 1) { 
        if (currentPage > 0) {
          navButtons.push({ text: '⬅️ Back', callback_data: `navigate_${action}_${type}_${currentPage - 1}` });
        }
        if (currentPage < totalPages - 1) {
          navButtons.push({ text: '➡️ Next', callback_data: `navigate_${action}_${type}_${currentPage + 1}` });
        }
      }
      if (navButtons.length > 0) {
        keyboard.push(navButtons);
      }
      keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);

      const serverList = currentServers.map(server => {
        const hargaPer30Hari = server.harga * 30; 
        const isFull = server.total_create_akun >= server.batas_create_akun;
        return `🌐 *${server.nama_server}*\n` +
               `💰 Harga per hari: Rp${server.harga}\n` +
               `📅 Harga per 30 hari: Rp${hargaPer30Hari}\n` +
               `📊 Quota: ${server.quota}GB\n` +
               `🔢 Limit IP: ${server.iplimit} IP\n` +
               (isFull ? `⚠️ *Server Penuh*` : `👥 Total Create Akun: ${server.total_create_akun}/${server.batas_create_akun}`);
      }).join('\n\n');

      if (ctx.updateType === 'callback_query') {
        ctx.editMessageText(`📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages}):*\n\n${serverList}`, {
          reply_markup: {
            inline_keyboard: keyboard
          },
          parse_mode: 'Markdown'
        });
      } else {
        ctx.reply(`📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages}):*\n\n${serverList}`, {
          reply_markup: {
            inline_keyboard: keyboard
          },
          parse_mode: 'Markdown'
        });
      }
      stateManager.setState(ctx.chat.id, { step: `${action}_username_${type}`, page: currentPage });
    });
  } catch (error) {
    console.error(`❌ Error saat memulai proses ${action} untuk ${type}:`, error);
    await ctx.reply(`❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.`, { parse_mode: 'Markdown' });
  }
}

bot.action(/navigate_(\w+)_(\w+)_(\d+)/, async (ctx) => {
  const [, action, type, page] = ctx.match;
  await startSelectServer(ctx, action, type, parseInt(page, 10));
});

// Service Action Handlers
const serviceActions = ['create', 'trial', 'renew'];
const serviceTypes = ['vmess', 'vless', 'trojan', 'ssh'];

serviceActions.forEach(action => {
  serviceTypes.forEach(type => {
    bot.action(`${action}_${type}`, async (ctx) => {
      if (!ctx || !ctx.match) {
        return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
      }
      await startSelectServer(ctx, action, type);
    });
  });
});

// Username Selection Handler - PERBAIKAN UTAMA
bot.action(/(create|renew|trial)_username_(vmess|vless|trojan|ssh)_(.+)/, async (ctx) => {
  const action = ctx.match[1];
  const type = ctx.match[2];
  const serverId = ctx.match[3];
  const userId = String(ctx.chat.id);

  if (action === "trial") {
    try {
      const { used, message } = await hasUsedTrial(userId, type, serverId);
      
      if (used) {
        return ctx.reply(message, { parse_mode: 'Markdown' });
      }

      let msg;
      switch (type) {
        case "ssh":
          msg = await trialssh(serverId, ctx);
          break;
        case "vmess":
          msg = await trialvmess(serverId, ctx);
          break;
        case "vless":
          msg = await trialvless(serverId, ctx);
          break;
        case "trojan":
          msg = await trialtrojan(serverId, ctx);
          break;
        default:
          throw new Error(`Protocol ${type} not supported`);
      }

      await recordTrial(userId, type, serverId);

      return ctx.reply(msg, { parse_mode: 'Markdown' });

    } catch (err) {
      console.error('Error in trial action:', err);
      return ctx.reply('❌ *Terjadi kesalahan saat memproses trial. Silakan coba lagi.*', { 
        parse_mode: 'Markdown' 
      });
    }
  }

  // Untuk create/renew - PERBAIKAN: Gunakan format state yang konsisten
  try {
    stateManager.setState(ctx.chat.id, { 
      step: `username_${action}_${type}`, 
      serverId, 
      type, 
      action 
    });

    const server = await new Promise((resolve, reject) => {
      db.get('SELECT batas_create_akun, total_create_akun FROM Server WHERE id = ?', 
        [serverId], 
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!server) {
      return ctx.reply('❌ *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
    }

    if (server.total_create_akun >= server.batas_create_akun) {
      return ctx.reply('❌ *Server penuh. Tidak dapat membuat akun baru di server ini.*', { 
        parse_mode: 'Markdown' 
      });
    }

    await ctx.reply('👤 *Masukkan username:*', { parse_mode: 'Markdown' });

  } catch (err) {
    console.error('Error in create/renew:', err);
    return ctx.reply('❌ *Terjadi kesalahan sistem. Silakan coba lagi.*', { 
      parse_mode: 'Markdown' 
    });
  }
});

// PERBAIKAN UTAMA: Text Handler dengan State Management yang Robust
async function handleUsernameStep(ctx, state, text, userId) {
  state.username = text.trim();

  if (!state.username) {
    return ctx.reply('❌ *Username tidak valid. Masukkan username yang valid.*', { parse_mode: 'Markdown' });
  }

  if (state.username.length < 3 || state.username.length > 20) {
    return ctx.reply('❌ *Username harus terdiri dari 3 hingga 20 karakter.*', { parse_mode: 'Markdown' });
  }

  if (/[^a-zA-Z0-9]/.test(state.username)) {
    return ctx.reply('❌ *Username tidak boleh mengandung karakter khusus atau spasi.*', { parse_mode: 'Markdown' });
  }

  const { username, serverId, type, action } = state;
  
  console.log(`✅ Username '${username}' disimpan untuk ${action} ${type}, menunggu input selanjutnya`);

  if (action === 'create') {
    if (type === 'ssh') {
      stateManager.setState(userId, { 
        ...state,
        step: `password_${action}_${type}` 
      });
      await ctx.reply('🔑 *Masukkan password:*', { parse_mode: 'Markdown' });
    } else {
      stateManager.setState(userId, { 
        ...state,
        step: `exp_${action}_${type}` 
      });
      await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
    }
  } else if (action === 'renew') {
    stateManager.setState(userId, { 
      ...state,
      step: `exp_${action}_${type}` 
    });
    await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
  }
}

async function handlePasswordStep(ctx, state, text, userId) {
  state.password = text.trim();

  if (!state.password) {
    return ctx.reply('❌ *Password tidak valid. Masukkan password yang valid.*', { parse_mode: 'Markdown' });
  }

  if (state.password.length < 4) {
    return ctx.reply('❌ *Password harus terdiri dari minimal 4 karakter.*', { parse_mode: 'Markdown' });
  }

  stateManager.setState(userId, { 
    ...state,
    step: `exp_${state.action}_${state.type}` 
  });
  await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
}

async function handleExpStep(ctx, state, text, userId) {
  const expInput = text.trim();

  if (!/^\d+$/.test(expInput)) {
    return ctx.reply('❌ *Masa aktif tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
  }

  const exp = parseInt(expInput, 10);

  if (isNaN(exp) || exp <= 0) {
    return ctx.reply('❌ *Masa aktif tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
  }

  if (exp > 365) {
    return ctx.reply('❌ *Masa aktif tidak boleh lebih dari 365 hari.*', { parse_mode: 'Markdown' });
  }

  let resellerStatus = 'off';
  let kelipatanBuy = 30;
  
  try {
    const [resellerRow, kelipatanRow] = await Promise.all([
      new Promise((resolve) => {
        db.get('SELECT value FROM lainnya WHERE key = "reseller"', [], (err, row) => {
          if (err) {
            console.error('Error reading reseller status:', err);
            resolve(null);
          } else {
            resolve(row);
          }
        });
      }),
      new Promise((resolve) => {
        db.get('SELECT value FROM lainnya WHERE key = "kelipatan_buy"', [], (err, row) => {
          if (err) {
            console.error('Error reading kelipatan_buy:', err);
            resolve(null);
          } else {
            resolve(row);
          }
        });
      })
    ]);

    resellerStatus = resellerRow?.value?.trim().toLowerCase() || 'off';
    if (resellerStatus !== 'on' && resellerStatus !== 'off') {
      resellerStatus = 'off';
    }

    if (kelipatanRow?.value) {
      const kelipatan = parseInt(kelipatanRow.value);
      if (!isNaN(kelipatan) && kelipatan > 0) {
        kelipatanBuy = kelipatan;
      }
    }
  } catch (err) {
    console.error('Error reading database settings:', err);
    resellerStatus = 'off';
    kelipatanBuy = 30;
  }

  const isAdmin = adminIds.includes(ctx.from.id);
  
  if (resellerStatus === 'on' && exp % kelipatanBuy !== 0 && !isAdmin) {
    return ctx.reply(`❌ *Masa aktif hanya bisa diinput dalam kelipatan ${kelipatanBuy} hari.*`, { parse_mode: 'Markdown' });
  }

  if (isAdmin && resellerStatus === 'on' && exp % kelipatanBuy !== 0) {
    console.log(`Admin ${ctx.from.id} is bypassing kelipatan_buy restriction (reseller mode is on)`);
  }

  // PERBAIKAN KRITIS: Update state dengan benar dan langsung proses
  const updatedState = {
    ...state,
    exp: exp // Pastikan exp disimpan
  };

  console.log(`✅ Exp ${exp} hari disimpan untuk ${updatedState.action} ${updatedState.type}, serverId: ${updatedState.serverId}`);
  console.log(`🔍 Updated state:`, updatedState);

  // Langsung proses dengan state yang sudah diupdate
  await processAccountCreation(ctx, updatedState, userId);
}

// FUNGSI BARU: Memproses pembuatan akun
async function processAccountCreation(ctx, state, userId) {
  const { username, password, exp, serverId, type, action } = state;

  console.log(`🔄 Memproses ${action} ${type} untuk username: ${username}, exp: ${exp}, serverId: ${serverId}`);

  try {
    const server = await new Promise((resolve, reject) => {
      db.get('SELECT quota, iplimit, harga, domain, auth, nama_server FROM Server WHERE id = ?', [serverId], (err, row) => {
        if (err || !row) {
          reject(new Error('❌ Server tidak ditemukan.'));
        } else {
          resolve(row);
        }
      });
    });

    const totalHarga = server.harga * exp;

    // Cek saldo user
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT saldo FROM users WHERE user_id = ?', [ctx.from.id], (err, row) => {
        if (err || !row) {
          reject(new Error('❌ User tidak ditemukan.'));
        } else {
          resolve(row);
        }
      });
    });

    if (user.saldo < totalHarga) {
      return ctx.reply(`❌ *Saldo tidak cukup. Anda memerlukan ${totalHarga} IDR.*`, { parse_mode: 'Markdown' });
    }

    let msg;
    console.log(`🎯 Memanggil fungsi ${action} ${type} dengan parameter:`);
    console.log(`   - username: ${username}`);
    console.log(`   - exp: ${exp}`);
    console.log(`   - quota: ${server.quota}`);
    console.log(`   - iplimit: ${server.iplimit}`);
    console.log(`   - serverId: ${serverId}`);

    // Panggil fungsi yang sesuai
    if (action === 'create') {
      switch (type) {
        case 'vmess':
          msg = await createvmess(username, exp, server.quota, server.iplimit, serverId, ctx);
          break;
        case 'vless':
          msg = await createvless(username, exp, server.quota, server.iplimit, serverId, ctx);
          break;
        case 'trojan':
          msg = await createtrojan(username, exp, server.quota, server.iplimit, serverId, ctx);
          break;
        case 'ssh':
          msg = await createssh(username, password, exp, server.iplimit, serverId, ctx);
          break;
      }
    } else if (action === 'renew') {
      switch (type) {
        case 'vmess':
          msg = await renewvmess(username, exp, server.quota, server.iplimit, serverId, ctx);
          break;
        case 'vless':
          msg = await renewvless(username, exp, server.quota, server.iplimit, serverId, ctx);
          break;
        case 'trojan':
          msg = await renewtrojan(username, exp, server.quota, server.iplimit, serverId, ctx);
          break;
        case 'ssh':
          msg = await renewssh(username, exp, server.iplimit, serverId, ctx);
          break;
      }
    }

    if (msg && !msg.includes('❌')) {
      // Kurangi saldo dan update server
      await db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [totalHarga, ctx.from.id]);
      await db.run('UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?', [serverId]);
      
      await ctx.reply(msg, { parse_mode: 'Markdown' });
      console.log(`✅ ${action} ${type} berhasil untuk username: ${username}`);
    } else {
      throw new Error(msg || 'Gagal membuat akun.');
    }

  } catch (error) {
    console.error('⚠️ Error processAccountCreation:', error.message);
    await ctx.reply(`❌ ${error.message}`, { parse_mode: 'Markdown' });
  } finally {
    stateManager.clearState(userId);
    console.log(`🧹 State cleared untuk user ${userId}`);
  }
}

// Text Handler untuk admin operations
async function handleAddServerStep(ctx, state, text, userId) {
  const domain = text.trim();
  if (!domain) {
    await ctx.reply('⚠️ *Domain tidak boleh kosong.* Silakan masukkan domain server yang valid.', { parse_mode: 'Markdown' });
    return;
  }

  stateManager.setState(userId, { step: 'addserver_auth', domain: domain });
  await ctx.reply('🔑 *Silakan masukkan auth server:*', { parse_mode: 'Markdown' });
}

async function handleAddServerAuthStep(ctx, state, text, userId) {
  const auth = text.trim();
  if (!auth) {
    await ctx.reply('⚠️ *Auth tidak boleh kosong.* Silakan masukkan auth server yang valid.', { parse_mode: 'Markdown' });
    return;
  }

  stateManager.setState(userId, { step: 'addserver_nama_server', auth: auth });
  await ctx.reply('🏷️ *Silakan masukkan nama server:*', { parse_mode: 'Markdown' });
}

async function handleAddServerNamaStep(ctx, state, text, userId) {
  const nama_server = text.trim();
  if (!nama_server) {
    await ctx.reply('⚠️ *Nama server tidak boleh kosong.* Silakan masukkan nama server yang valid.', { parse_mode: 'Markdown' });
    return;
  }

  stateManager.setState(userId, { step: 'addserver_quota', nama_server: nama_server });
  await ctx.reply('📊 *Silakan masukkan quota server:*', { parse_mode: 'Markdown' });
}

async function handleAddServerQuotaStep(ctx, state, text, userId) {
  const quota = parseInt(text.trim(), 10);
  if (isNaN(quota)) {
    await ctx.reply('⚠️ *Quota tidak valid.* Silakan masukkan quota server yang valid.', { parse_mode: 'Markdown' });
    return;
  }

  stateManager.setState(userId, { step: 'addserver_iplimit', quota: quota });
  await ctx.reply('🔢 *Silakan masukkan limit IP server:*', { parse_mode: 'Markdown' });
}

async function handleAddServerIpLimitStep(ctx, state, text, userId) {
  const iplimit = parseInt(text.trim(), 10);
  if (isNaN(iplimit)) {
    await ctx.reply('⚠️ *Limit IP tidak valid.* Silakan masukkan limit IP server yang valid.', { parse_mode: 'Markdown' });
    return;
  }

  stateManager.setState(userId, { step: 'addserver_batas_create_akun', iplimit: iplimit });
  await ctx.reply('🔢 *Silakan masukkan batas create akun server:*', { parse_mode: 'Markdown' });
}

async function handleAddServerBatasCreateStep(ctx, state, text, userId) {
  const batas_create_akun = parseInt(text.trim(), 10);
  if (isNaN(batas_create_akun)) {
    await ctx.reply('⚠️ *Batas create akun tidak valid.* Silakan masukkan batas create akun server yang valid.', { parse_mode: 'Markdown' });
    return;
  }

  stateManager.setState(userId, { step: 'addserver_harga', batas_create_akun: batas_create_akun });
  await ctx.reply('💰 *Silakan masukkan harga server:*', { parse_mode: 'Markdown' });
}

async function handleAddServerHargaStep(ctx, state, text, userId) {
  const harga = parseFloat(text.trim());
  if (isNaN(harga) || harga <= 0) {
    await ctx.reply('⚠️ *Harga tidak valid.* Silakan masukkan harga server yang valid.', { parse_mode: 'Markdown' });
    return;
  }
  
  const { domain, auth, nama_server, quota, iplimit, batas_create_akun } = state;

  try {
    db.run('INSERT INTO Server (domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, total_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
      [domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, 0], 
      function(err) {
        if (err) {
          console.error('Error saat menambahkan server:', err.message);
          ctx.reply('❌ *Terjadi kesalahan saat menambahkan server baru.*', { parse_mode: 'Markdown' });
        } else {
          ctx.reply(`✅ *Server baru dengan domain ${domain} telah berhasil ditambahkan.*\n\n📄 *Detail Server:*\n- Domain: ${domain}\n- Auth: ${auth}\n- Nama Server: ${nama_server}\n- Quota: ${quota}\n- Limit IP: ${iplimit}\n- Batas Create Akun: ${batas_create_akun}\n- Harga: Rp ${harga}`, { parse_mode: 'Markdown' });
        }
        stateManager.clearState(userId);
      }
    );
  } catch (error) {
    console.error('Error saat menambahkan server:', error);
    await ctx.reply('❌ *Terjadi kesalahan saat menambahkan server baru.*', { parse_mode: 'Markdown' });
    stateManager.clearState(userId);
  }
}

// Handler untuk edit operations
async function handleEditHargaStep(ctx, state, text, userId) {
  const hargaBaru = parseFloat(text.trim());
  if (isNaN(hargaBaru) || hargaBaru <= 0) {
    return ctx.reply('❌ *Harga tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
  }

  try {
    await updateServerField(state.serverId, hargaBaru, 'UPDATE Server SET harga = ? WHERE id = ?');
    ctx.reply(`✅ *Harga server berhasil diupdate.*\n\n📄 *Detail Server:*\n- Harga Baru: *Rp ${hargaBaru}*`, { parse_mode: 'Markdown' });
  } catch (err) {
    ctx.reply('❌ *Terjadi kesalahan saat mengupdate harga server.*', { parse_mode: 'Markdown' });
  }
  stateManager.clearState(userId);
}

async function handleEditNamaStep(ctx, state, text, userId) {
  const namaBaru = text.trim();
  if (!namaBaru) {
    return ctx.reply('❌ *Nama server tidak boleh kosong.*', { parse_mode: 'Markdown' });
  }

  try {
    await updateServerField(state.serverId, namaBaru, 'UPDATE Server SET nama_server = ? WHERE id = ?');
    ctx.reply(`✅ *Nama server berhasil diupdate.*\n\n📄 *Detail Server:*\n- Nama Baru: *${namaBaru}*`, { parse_mode: 'Markdown' });
  } catch (err) {
    ctx.reply('❌ *Terjadi kesalahan saat mengupdate nama server.*', { parse_mode: 'Markdown' });
  }
  stateManager.clearState(userId);
}

async function handleEditDomainStep(ctx, state, text, userId) {
  const domainBaru = text.trim();
  if (!domainBaru) {
    return ctx.reply('❌ *Domain server tidak boleh kosong.*', { parse_mode: 'Markdown' });
  }

  try {
    await updateServerField(state.serverId, domainBaru, 'UPDATE Server SET domain = ? WHERE id = ?');
    ctx.reply(`✅ *Domain server berhasil diupdate.*\n\n📄 *Detail Server:*\n- Domain Baru: *${domainBaru}*`, { parse_mode: 'Markdown' });
  } catch (err) {
    ctx.reply('❌ *Terjadi kesalahan saat mengupdate domain server.*', { parse_mode: 'Markdown' });
  }
  stateManager.clearState(userId);
}

async function handleEditAuthStep(ctx, state, text, userId) {
  const authBaru = text.trim();
  if (!authBaru) {
    return ctx.reply('❌ *Auth server tidak boleh kosong.*', { parse_mode: 'Markdown' });
  }

  try {
    await updateServerField(state.serverId, authBaru, 'UPDATE Server SET auth = ? WHERE id = ?');
    ctx.reply(`✅ *Auth server berhasil diupdate.*\n\n📄 *Detail Server:*\n- Auth Baru: *${authBaru}*`, { parse_mode: 'Markdown' });
  } catch (err) {
    ctx.reply('❌ *Terjadi kesalahan saat mengupdate auth server.*', { parse_mode: 'Markdown' });
  }
  stateManager.clearState(userId);
}

async function handleEditQuotaStep(ctx, state, text, userId) {
  const quotaBaru = parseInt(text.trim(), 10);
  if (isNaN(quotaBaru) || quotaBaru <= 0) {
    return ctx.reply('❌ *Quota tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
  }

  try {
    await updateServerField(state.serverId, quotaBaru, 'UPDATE Server SET quota = ? WHERE id = ?');
    ctx.reply(`✅ *Quota server berhasil diupdate.*\n\n📄 *Detail Server:*\n- Quota Baru: *${quotaBaru}*`, { parse_mode: 'Markdown' });
  } catch (err) {
    ctx.reply('❌ *Terjadi kesalahan saat mengupdate quota server.*', { parse_mode: 'Markdown' });
  }
  stateManager.clearState(userId);
}

async function handleEditIpLimitStep(ctx, state, text, userId) {
  const iplimitBaru = parseInt(text.trim(), 10);
  if (isNaN(iplimitBaru) || iplimitBaru <= 0) {
    return ctx.reply('❌ *Limit IP tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
  }

  try {
    await updateServerField(state.serverId, iplimitBaru, 'UPDATE Server SET iplimit = ? WHERE id = ?');
    ctx.reply(`✅ *Limit IP server berhasil diupdate.*\n\n📄 *Detail Server:*\n- Limit IP Baru: *${iplimitBaru}*`, { parse_mode: 'Markdown' });
  } catch (err) {
    ctx.reply('❌ *Terjadi kesalahan saat mengupdate limit IP server.*', { parse_mode: 'Markdown' });
  }
  stateManager.clearState(userId);
}

async function handleEditBatasCreateStep(ctx, state, text, userId) {
  const batasBaru = parseInt(text.trim(), 10);
  if (isNaN(batasBaru) || batasBaru <= 0) {
    return ctx.reply('❌ *Batas create akun tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
  }

  try {
    await updateServerField(state.serverId, batasBaru, 'UPDATE Server SET batas_create_akun = ? WHERE id = ?');
    ctx.reply(`✅ *Batas create akun server berhasil diupdate.*\n\n📄 *Detail Server:*\n- Batas Create Akun Baru: *${batasBaru}*`, { parse_mode: 'Markdown' });
  } catch (err) {
    ctx.reply('❌ *Terjadi kesalahan saat mengupdate batas create akun server.*', { parse_mode: 'Markdown' });
  }
  stateManager.clearState(userId);
}

async function handleEditTotalCreateStep(ctx, state, text, userId) {
  const totalBaru = parseInt(text.trim(), 10);
  if (isNaN(totalBaru) || totalBaru < 0) {
    return ctx.reply('❌ *Total create akun tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
  }

  try {
    await updateServerField(state.serverId, totalBaru, 'UPDATE Server SET total_create_akun = ? WHERE id = ?');
    ctx.reply(`✅ *Total create akun server berhasil diupdate.*\n\n📄 *Detail Server:*\n- Total Create Akun Baru: *${totalBaru}*`, { parse_mode: 'Markdown' });
  } catch (err) {
    ctx.reply('❌ *Terjadi kesalahan saat mengupdate total create akun server.*', { parse_mode: 'Markdown' });
  }
  stateManager.clearState(userId);
}

async function handleAddSaldoStep(ctx, state, text, userId) {
  const saldo = parseInt(text.trim(), 10);
  if (isNaN(saldo) || saldo <= 0) {
    return ctx.reply('❌ *Jumlah saldo tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
  }

  try {
    await updateUserSaldo(state.userId, saldo);
    ctx.reply(`✅ *Saldo user berhasil ditambahkan.*\n\n📄 *Detail Saldo:*\n- Jumlah Saldo: *Rp ${saldo}*`, { parse_mode: 'Markdown' });
  } catch (err) {
    ctx.reply('❌ *Terjadi kesalahan saat menambahkan saldo user.*', { parse_mode: 'Markdown' });
  }
  stateManager.clearState(userId);
}

// Helper functions untuk update database
async function updateUserSaldo(userId, saldo) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET saldo = saldo + ? WHERE id = ?', [saldo, userId], function (err) {
      if (err) {
        console.error('⚠️ Kesalahan saat menambahkan saldo user:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function updateServerField(serverId, value, query) {
  return new Promise((resolve, reject) => {
    db.run(query, [value, serverId], function (err) {
      if (err) {
        console.error(`⚠️ Kesalahan saat mengupdate server:`, err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// ===================================================
// SISTEM DEPOSIT VPNNEXUS (QRIS Otomatis)
// ===================================================

global.depositState = {};
global.pendingDeposits = {};
global.processedTransactions = new Set();
let lastRequestTime = 0;
const requestInterval = 1000;

// Load pending deposits dari database saat startup
db.all('SELECT * FROM pending_deposits WHERE status = "pending"', [], (err, rows) => {
  if (err) {
    console.error('Gagal load pending_deposits:', err.message);
    return;
  }
  if (rows) {
    rows.forEach(row => {
      global.pendingDeposits[row.unique_code] = {
        amount: row.amount,
        originalAmount: row.original_amount,
        transactionId: row.transaction_id,
        userId: row.user_id,
        username: row.username,
        timestamp: row.timestamp,
        status: row.status,
        qrMessageId: row.qr_message_id
      };
    });
    console.log('Pending deposit loaded:', Object.keys(global.pendingDeposits).length);
  }
});

// Handler teks untuk deposit - user ketik nominal
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  // Cek apakah user sedang menunggu input nominal deposit
  if (global.depositState?.[userId]?.action === 'request_amount') {
    if (!/^\d+$/.test(text)) {
      return await ctx.reply('⚠️ Masukkan hanya angka, contoh: 10000');
    }

    const amount = parseInt(text);
    if (amount < 100) {
      return await ctx.reply('⚠️ Jumlah minimal deposit adalah Rp 100');
    }

    // Reset action agar tidak double process
    delete global.depositState[userId];
    await processDeposit(ctx, amount.toString());
    return;
  }

  // Handle regular state (addserver, edit server, dll)
  const state = stateManager.getState(userId);
  console.log(`📩 Received text from user ${userId}: "${text}"`);
  console.log(`🔍 Current state for user ${userId}:`, state);

  if (!state.step) {
    console.log(`❌ No active state for user ${userId}`);
    return;
  }

  try {
    if (state.step.startsWith('username_')) {
      await handleUsernameStep(ctx, state, text, userId);
    } else if (state.step.startsWith('password_')) {
      await handlePasswordStep(ctx, state, text, userId);
    } else if (state.step.startsWith('exp_')) {
      await handleExpStep(ctx, state, text, userId);
    } else if (state.step === 'addserver') {
      await handleAddServerStep(ctx, state, text, userId);
    } else if (state.step === 'addserver_auth') {
      await handleAddServerAuthStep(ctx, state, text, userId);
    } else if (state.step === 'addserver_nama_server') {
      await handleAddServerNamaStep(ctx, state, text, userId);
    } else if (state.step === 'addserver_quota') {
      await handleAddServerQuotaStep(ctx, state, text, userId);
    } else if (state.step === 'addserver_iplimit') {
      await handleAddServerIpLimitStep(ctx, state, text, userId);
    } else if (state.step === 'addserver_batas_create_akun') {
      await handleAddServerBatasCreateStep(ctx, state, text, userId);
    } else if (state.step === 'addserver_harga') {
      await handleAddServerHargaStep(ctx, state, text, userId);
    } else if (state.step === 'edit_harga') {
      await handleEditHargaStep(ctx, state, text, userId);
    } else if (state.step === 'edit_nama') {
      await handleEditNamaStep(ctx, state, text, userId);
    } else if (state.step === 'edit_domain') {
      await handleEditDomainStep(ctx, state, text, userId);
    } else if (state.step === 'edit_auth') {
      await handleEditAuthStep(ctx, state, text, userId);
    } else if (state.step === 'edit_quota') {
      await handleEditQuotaStep(ctx, state, text, userId);
    } else if (state.step === 'edit_limit_ip') {
      await handleEditIpLimitStep(ctx, state, text, userId);
    } else if (state.step === 'edit_batas_create_akun') {
      await handleEditBatasCreateStep(ctx, state, text, userId);
    } else if (state.step === 'edit_total_create_akun') {
      await handleEditTotalCreateStep(ctx, state, text, userId);
    } else if (state.step === 'add_saldo') {
      await handleAddSaldoStep(ctx, state, text, userId);
    } else {
      console.log(`❌ Unknown state step: ${state.step}`);
      await ctx.reply('❌ *Sesi telah kadaluarsa. Silakan mulai ulang proses.*', { parse_mode: 'Markdown' });
      stateManager.clearState(userId);
    }
  } catch (error) {
    console.error(`❌ Error processing text for user ${userId}:`, error);
    await ctx.reply('❌ *Terjadi kesalahan sistem. Silakan coba lagi.*', { parse_mode: 'Markdown' });
    stateManager.clearState(userId);
  }
});

async function processDeposit(ctx, amount) {
  const currentTime = Date.now();
  const userId = ctx.from.id;

  // Anti-spam / double request
  if (global.depositState?.[userId] === true) {
    return ctx.reply('⚠️ Kamu masih punya transaksi deposit yang belum selesai!');
  }

  if (currentTime - lastRequestTime < requestInterval) {
    return ctx.reply(
      '⚠️ *Terlalu banyak permintaan. Silahkan tunggu sebentar sebelum mencoba lagi.*',
      { parse_mode: 'Markdown' }
    );
  }
  lastRequestTime = currentTime;

  const uniqueCode = `user-${userId}-${currentTime}`;
  const amountInt = parseInt(amount);
  global.pendingDeposits ??= {};
  global.depositState[userId] = true;

  async function resetDepositState() {
    try {
      delete global.depositState?.[userId];
      delete global.pendingDeposits?.[uniqueCode];
      await deletePendingDeposit(uniqueCode).catch(() => {});
    } catch (e) {
      console.error('Gagal reset deposit:', e);
    }
  }

  let waitMsg;
  const start = Date.now();

  try {
    waitMsg = await ctx.reply('⏳ Mohon menunggu...');
    let dots = 0;
    const loading = setInterval(async () => {
      dots = (dots + 1) % 4;
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id, waitMsg.message_id, null,
          '⏳ Mohon menunggu' + '.'.repeat(dots)
        );
      } catch { clearInterval(loading); }
    }, 700);

    // === Request deposit ke API VPNNexus ===
    let depositResp;
    try {
      const apiRes = await axios.get(`${PAYMENT_BASE_URL}/deposit?amount=${amountInt}&apikey=${PAYMENT_APIKEY}`);
      if (apiRes.data.status !== 'success') throw new Error(apiRes.data.message || 'API deposit gagal');
      depositResp = apiRes.data.data;
    } catch (err) {
      clearInterval(loading);
      console.error('Gagal request deposit API:', err.message);
      await resetDepositState();
      try { await ctx.deleteMessage(waitMsg.message_id); } catch {}
      return ctx.reply('❌ Gagal membuat QRIS. Silakan coba lagi nanti.');
    }

    const { total_amount, qris_url, transaction_id, expired_minutes, fee } = depositResp;

    // === Download gambar QRIS dari URL ===
    let qrBuffer;
    try {
      const imgRes = await axios.get(qris_url, { responseType: 'arraybuffer' });
      qrBuffer = Buffer.from(imgRes.data);
    } catch (err) {
      clearInterval(loading);
      console.error('Gagal download gambar QRIS:', err.message);
      await resetDepositState();
      try { await ctx.deleteMessage(waitMsg.message_id); } catch {}
      return ctx.reply('❌ Gagal memuat gambar QRIS. Silakan coba lagi nanti.');
    }

    clearInterval(loading);

    // === Kirim QR ke user ===
    const caption = [
      `┏━━━━━━━━━━━━━━━━━━━━━┓`,
      `          🏷️*ᴅᴇᴛᴀɪʟ ᴘᴇᴍʙᴀʏᴀʀᴀɴ*🏷️`,
      `┗━━━━━━━━━━━━━━━━━━━━━┛`,
      ``,
      `💵 ɴᴏᴍɪɴᴀʟ: *Rp ${amountInt.toLocaleString('id-ID')}*`,
      `💳 ʙɪᴀʏᴀ ᴀᴅᴍɪɴ: *Rp ${(fee || 0).toLocaleString('id-ID')}*`,
      `💰 ᴛᴏᴛᴀʟ ʙᴀʏᴀʀ: *Rp ${total_amount.toLocaleString('id-ID')}*`,
      `⏳ ʙᴀᴛᴀꜱ ᴡᴀᴋᴛᴜ: *${expired_minutes || 5} ᴍᴇɴɪᴛ*`,
      `⚠️ ᴛʀᴀɴꜱꜰᴇʀ *ʜᴀʀᴜꜱ ꜱᴇꜱᴜᴀɪ ɴᴏᴍɪɴᴀʟ*`,
      ``,
      `✅ ᴘᴇᴍʙᴀʏᴀʀᴀɴ ᴏᴛᴏᴍᴀᴛɪꜱ`,
      `📌 ᴊᴀɴɢᴀɴ ᴛᴜᴛᴜᴘ ʜᴀʟᴀᴍᴀɴ ɪɴɪ`,
      ``,
      `┏━━━━━━━━━━━━━━━━━━━━━┓`,
      `    🌐 ᴅɪᴋᴇʟᴏʟᴀ ᴏʟᴇʜ *${NAMA_STORE}*`,
      `┗━━━━━━━━━━━━━━━━━━━━━┛`
    ].join('\n');

    const inlineKeyboard = [
      [{ text: '❌ Batal Topup', callback_data: `batal_topup_${uniqueCode}` }]
    ];

    const qrMessage = await ctx.replyWithPhoto(
      { source: qrBuffer },
      { caption, parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineKeyboard } }
    );

    try { await ctx.deleteMessage(waitMsg.message_id); } catch {}

    // === Simpan data deposit ke memori & database ===
    global.pendingDeposits[uniqueCode] = {
      amount: amountInt,
      originalAmount: amount,
      transactionId: transaction_id,
      userId,
      username: ctx.from.username || `user_${userId}`,
      timestamp: Date.now(),
      status: 'pending',
      qrMessageId: qrMessage.message_id
    };

    await insertPendingDeposit(
      uniqueCode, userId,
      ctx.from.username || `user_${userId}`,
      amountInt, amount, qrMessage.message_id
    );

    delete global.depositState[userId];
    console.log(`[DEPOSIT] ${userId} berhasil, transaction_id: ${transaction_id}, durasi: ${Date.now() - start}ms`);

  } catch (error) {
    console.error('❌ Kesalahan saat memproses deposit:', error);
    await resetDepositState();
    await ctx.reply(
      '❌ *GAGAL!* Terjadi kesalahan saat memproses pembayaran. Silahkan coba lagi nanti.',
      { parse_mode: 'Markdown' }
    );
  }
}

// Handler tombol batal topup
bot.action(/batal_topup_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const uniqueCode = ctx.match[1];
    const userId = ctx.from.id;

    if (global.pendingDeposits?.[uniqueCode]) {
      delete global.pendingDeposits[uniqueCode];
    }
    await deletePendingDeposit(uniqueCode).catch(() => {});
    delete global.depositState?.[userId];

    try { await ctx.deleteMessage(); } catch {}
    await ctx.reply('❌ *Top-up dibatalkan.*', { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error batal topup:', error);
  }
});

function insertPendingDeposit(uniqueCode, userId, username, finalAmount, originalAmount, qrMessageId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO pending_deposits (unique_code, user_id, username, amount, original_amount, timestamp, status, qr_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uniqueCode, userId, username, finalAmount, originalAmount, Date.now(), 'pending', qrMessageId],
      (err) => {
        if (err) {
          console.error('Gagal insert pending_deposits:', err.message);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

function deletePendingDeposit(uniqueCode) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
      if (err) {
        console.error('Gagal hapus pending_deposits:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function checkQRISStatus() {
  try {
    const pendingDeposits = Object.entries(global.pendingDeposits || {});
    for (const [uniqueCode, deposit] of pendingDeposits) {
      if (deposit.status !== 'pending') continue;

      const depositAge = Date.now() - deposit.timestamp;

      // Periksa kedaluwarsa (5 menit)
      if (depositAge > 5 * 60 * 1000) {
        try {
          if (deposit.qrMessageId) {
            await bot.telegram.deleteMessage(deposit.userId, deposit.qrMessageId);
          }
          await bot.telegram.sendMessage(deposit.userId,
            '❌ *Pembayaran Kedaluwarsa*\n\n' +
            'Waktu pembayaran telah habis. Silahkan klik Top Up lagi untuk mendapatkan QR baru.',
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          console.error('Error saat menghapus pesan pembayaran kedaluwarsa:', error);
        } finally {
          delete global.pendingDeposits[uniqueCode];
          db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
            if (err) console.error('Gagal menghapus pending_deposits (kedaluwarsa):', err.message);
          });
        }
        continue;
      }

      if (!deposit.transactionId) continue;

      try {
        // === Cek status pembayaran ke API VPNNexus ===
        const checkUrl = `${PAYMENT_BASE_URL}/status/payment?transaction_id=${deposit.transactionId}&apikey=${PAYMENT_APIKEY}`;
        const result = await axios.get(checkUrl);

        if (result.data.status === 'success' && result.data.paid === true) {
          const transactionKey = `${deposit.transactionId}_${deposit.amount}`;
          if (global.processedTransactions.has(transactionKey)) {
            console.log(`Transaksi ${transactionKey} sudah diproses, melewati...`);
            continue;
          }

          const success = await processMatchingPayment(deposit, { transaction_id: deposit.transactionId, amount: deposit.amount }, uniqueCode);
          if (success) {
            console.log(`Pembayaran berhasil diproses untuk ${uniqueCode}`);
            delete global.pendingDeposits[uniqueCode];
            db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
              if (err) console.error('Gagal menghapus pending_deposits (berhasil):', err.message);
            });
          }
        }
      } catch (error) {
        console.error(`Error saat memeriksa status pembayaran untuk ${uniqueCode}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error di checkQRISStatus:', error);
  }
}

// Jalankan pengecekan QRIS setiap 10 detik
setInterval(checkQRISStatus, 10 * 1000);

async function processMatchingPayment(deposit, transaction, uniqueCode) {
  const { userId, username, amount } = deposit;
  const transactionKey = `${transaction.transaction_id}_${amount}`;

  if (global.processedTransactions.has(transactionKey)) {
    console.log(`Transaksi ${transactionKey} sudah diproses sebelumnya.`);
    return false;
  }
  global.processedTransactions.add(transactionKey);

  return new Promise((resolve) => {
    db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], async (err, row) => {
      if (err || !row) {
        console.error('User tidak ditemukan:', userId);
        global.processedTransactions.delete(transactionKey);
        resolve(false);
        return;
      }

      const currentBalance = row.saldo;
      const depositAmount = amount;
      const newBalance = currentBalance + depositAmount;

      db.run('UPDATE users SET saldo = ? WHERE user_id = ?', [newBalance, userId], async (err) => {
        if (err) {
          console.error('Gagal update saldo:', err.message);
          global.processedTransactions.delete(transactionKey);
          resolve(false);
          return;
        }

        // Hapus QR message
        if (deposit.qrMessageId) {
          try {
            await bot.telegram.deleteMessage(userId, deposit.qrMessageId);
          } catch (e) {
            console.error('Gagal hapus pesan QR:', e.message);
          }
        }

        const userMsg = `
✅ *Top Up Berhasil!*

🧾 *Kode Transaksi:* \`${transaction.transaction_id}\`
💰 *Nominal Deposit:* Rp ${depositAmount.toLocaleString('id-ID')}
📥 *Saldo Sebelumnya:* Rp ${currentBalance.toLocaleString('id-ID')}
📈 *Saldo Sekarang:* Rp ${newBalance.toLocaleString('id-ID')}
        `.trim();

        try {
          await bot.telegram.sendMessage(userId, userMsg, { parse_mode: 'Markdown' });
        } catch (e) {
          console.error('Gagal kirim notif user:', e.message);
        }

        // Notifikasi ke admin
        const adminMsg = `
👤 *User Deposit Sukses*
🆔 ID: ${userId}
🔤 Username: @${username || userId}
🧾 Kode: \`${transaction.transaction_id}\`
💰 Nominal: Rp ${depositAmount.toLocaleString('id-ID')}
📈 Saldo Baru: Rp ${newBalance.toLocaleString('id-ID')}
        `.trim();

        try {
          await bot.telegram.sendMessage(adminIds, adminMsg, { parse_mode: 'Markdown' });
        } catch (e) {
          console.error('Gagal kirim notif admin:', e.message);
        }

        // Log topup
        logTopup(userId, username, depositAmount, 'QRIS VPNNexus');

        // Proses bonus jika ada
        await prosesBonusTopUp(userId, username, depositAmount);

        console.log(`✅ Deposit sukses user ${userId}, saldo masuk: Rp ${depositAmount}`);
        resolve(true);
      });
    });
  });
}

// Topup Saldo Action - Sistem VPNNexus QRIS
bot.action('topup_saldo', async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  try {
    await ctx.answerCbQuery();
    console.log(`🔍 User ${userId} memulai proses top-up saldo (QRIS VPNNexus).`);

    // Init global depositState
    if (!global.depositState) global.depositState = {};
    global.depositState[userId] = { action: 'request_amount', amount: '' };

    console.log(`📝 Menunggu input nominal dari user ${userId}`);

    const sent = await ctx.reply(
`
💳━━━━━━━━━━━━━━━━━━━━💳
        *Qʀɪꜱ VPNNexus ᴛᴏᴘ-ᴜᴘ*
💳━━━━━━━━━━━━━━━━━━━━💳

⚡ *ꜱɪʟᴀʜᴋᴀɴ ᴋᴇᴛɪᴋ ɴᴏᴍɪɴᴀʟ ᴛᴏᴘ-ᴜᴘ*  
ʏᴀɴɢ ɪɴɢɪɴ ᴀɴᴅᴀ ʙᴀʏᴀʀᴋᴀɴ ᴍᴇʟᴀʟᴜɪ ᴍᴇᴛᴏᴅᴇ Qʀɪꜱ.  

💰 ᴍɪɴɪᴍᴀʟ ᴛᴏᴘ-ᴜᴘ: *Rp 100*  
🧾 ᴄᴏɴᴛᴏʜ: \`10000\`

━━━━━━━━━━━━━━━━━━━━━━━
⌛ ᴋᴇᴍᴜᴅɪᴀɴ ᴛᴜɴɢɢᴜ ᴘʀᴏꜱᴇꜱ ᴏᴛᴏᴍᴀᴛɪꜱ.  
ᴀᴘᴀʙɪʟᴀ ꜱᴀʟᴅᴏ ʙᴇʟᴜᴍ ᴍᴀꜱᴜᴋ,  
ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ᴅᴇɴɢᴀɴ ʙᴜᴋᴛɪ ᴛʀᴀɴꜱᴀᴋꜱɪ.  
━━━━━━━━━━━━━━━━━━━━━━━
`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('❌ Kesalahan saat memulai proses top-up saldo:', error);
    try {
      await ctx.reply(
        '❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*',
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('Gagal kirim pesan error:', e.message);
    }
  }
});

// Cek Saldo Action
bot.action('cek_saldo', async (ctx) => { 
  try {
    const userId = ctx.from.id;

    const row = await new Promise((resolve, reject) => {
      db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
          console.error('❌ Kesalahan saat memeriksa saldo:', err.message);
          return reject('❌ *Terjadi kesalahan saat memeriksa saldo Anda. Silakan coba lagi nanti.*');
        }
        resolve(row);
      });
    });

    if (row) {
      await ctx.reply(`
Saldo Anda saat ini
💰 Rp ${row.saldo.toLocaleString()} 🔥

🆔 ID Kamu: ${userId}

━━━━━━━━━━━━━━━━━
*Terima kasih telah menggunakan layanan kami!*
      `, { 
        parse_mode: 'Markdown'
      });
    } else {
      await ctx.reply(`
⚠️ *Anda belum memiliki saldo.*
Silakan topup saldo terlebih dahulu untuk menikmati layanan kami.
      `, { 
        parse_mode: 'Markdown' 
      });
    }
  } catch (error) {
    console.error('❌ Kesalahan saat memeriksa saldo:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

// Backup otomatis setiap 6 jam
setInterval(async () => {
  const filePath = path.join(__dirname, 'sellvpn.db');

  if (!fs.existsSync(filePath)) {
    console.log('❌ File database tidak ditemukan.');
    return;
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const filename = `sellvpn_backup_${timestamp}.db`;

  try {
    await bot.telegram.sendDocument(adminIds, {
      source: filePath,
      filename: filename
    });
    console.log(`✅ [${now.toLocaleString()}] Backup berhasil dikirim ke admin ${adminIds}`);
  } catch (err) {
    console.error(`❌ [${now.toLocaleString()}] Gagal mengirim backup:`, err.message);
  }
}, 21600000); // 6 jam = 21600000 milidetik

// Start server
app.listen(port, () => {
  bot.launch().then(() => {
    console.log('Bot telah dimulai');
  }).catch((error) => {
    console.error('Error saat memulai bot:', error);
  });
  console.log(`Server berjalan di port ${port}`);
});

// Error handling
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  db.close();
});

process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  db.close();
});