const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const { Telegraf, session } = require('telegraf');
const app = express();
const axios = require('axios');
const winston = require('winston');
const fetch = require("node-fetch");
const FormData = require("form-data");
const FOLDER_TEMPATDB = "/root/BotVPN2/sellvpn.db";
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: 'bot-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'bot-combined.log' }),
  ],
});
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const {
  trialssh,
  trialvmess,
  trialvless,
  trialtrojan,
  trialshadowsocks
} = require("./modules/create");

const {
  createssh,
  createvmess,
  createvless,
  createtrojan,
  createshadowsocks
} = require('./modules/create');

const {
  renewssh,
  renewvmess,
  renewvless,
  renewtrojan,
  renewshadowsocks
} = require('./modules/renew');

const fs = require('fs');
const vars = JSON.parse(fs.readFileSync('./.vars.json', 'utf8'));


const BOT_TOKEN = vars.BOT_TOKEN;
const port = vars.PORT || 50123;
const ADMIN = vars.USER_ID;
const NAMA_STORE = vars.NAMA_STORE || 'XWANSTORE';
const groupId = vars.GROUP_CHAT_ID;
const ADMIN_WA = vars.ADMIN_WA;
const GROUP_USERNAME = vars.GROUP_USERNAME;

// === Payment API VPNNexus ===
const PAYMENT_APIKEY = vars.PAYMENT_APIKEY || '8d5ab019-1c72-4701-92f7-29c64730edf3';
const PAYMENT_BASE_URL = 'https://payment.vpnnexus.biz.id/api';

const bot = new Telegraf(BOT_TOKEN);

// =======================
// GATE WAJIB JOIN (Channel & Group)
// =======================

// Username/Link yang diwajibkan
const REQUIRED_CHANNEL = '@ansendant';
const REQUIRED_GROUP   = '@myridtunnel';
const channelLink = 'https://t.me/ansendant';
const groupLink   = 'https://t.me/myridtunnel';

/**
 * Kirim UI ajakan bergabung dengan tampilan keren (pakai backticks).
 */
async function sendJoinGate(ctx) {
  const gateText = 
`🔔 *Selamat Datang Di ${NAMA_STORE} 🤗*

\`\`\`
Untuk menggunakan bot ini, Anda harus bergabung
dengan komunitas kami terlebih dahulu.
\`\`\`

📢 *Channel*: ${REQUIRED_CHANNEL}
👥 *Group*  : ${REQUIRED_GROUP}

Silakan gabung ke keduanya, lalu tekan tombol
"✅ Saya Sudah Bergabung" di bawah ini untuk lanjut.`;

  try {
    await ctx.reply(gateText, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 Gabung Channel kami', url: channelLink }],
          [{ text: '💬 Gabung Group kami',   url: groupLink }],
          [{ text: '✅ Saya Sudah Bergabung, Lanjutkan', callback_data: 'continue_after_join' }],
        ]
      }
    });
  } catch (e) {
    logger.error('Gagal mengirim Join Gate:', e.message);
  }
}

/**
 * Cek apakah user sudah join channel & group.
 * Memakai username @ untuk getChatMember.
 */
async function checkMembership(ctx) {
  const userId = ctx.from?.id;
  if (!userId) return false;

  try {
    const ch = await ctx.telegram.getChatMember(REQUIRED_CHANNEL, userId);
    const gr = await ctx.telegram.getChatMember(REQUIRED_GROUP,   userId);

    const okStatus = new Set(['creator','administrator','member','owner']);
    if (okStatus.has(ch?.status) && okStatus.has(gr?.status)) {
      return true;
    }
  } catch (e) {
    // Bila belum join / private channel, getChatMember bisa error -> anggap belum join
    logger.warn('checkMembership warn:', e.message);
  }
  return false;
}

// Handler tombol "Saya Sudah Bergabung"
bot.action('continue_after_join', async (ctx) => {
  try { await ctx.answerCbQuery(); } catch (e) {}
  if (await checkMembership(ctx)) {
    return sendMainMenu(ctx);
  }
  return sendJoinGate(ctx);
});

const adminIds = ADMIN;
logger.info('Bot initialized');

const db = new sqlite3.Database('./sellvpn.db', (err) => {
    if (err) {
        logger.error('Kesalahan koneksi SQLite3:', err.message);
    } else {
        logger.info('✅ Terhubung ke SQLite3');

        db.serialize(() => {

            // Inisialisasi tabel bonus_config
            db.run(`
                CREATE TABLE IF NOT EXISTS bonus_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    enabled INTEGER DEFAULT 0,
                    min_topup INTEGER DEFAULT 0,
                    bonus_percent INTEGER DEFAULT 0
                )
            `, (err) => {
                if (err) logger.error('❌ Gagal membuat tabel bonus_config:', err.message);
                else logger.info('✅ Tabel bonus_config siap');
            });

            db.run(`
                INSERT OR IGNORE INTO bonus_config (id, enabled, min_topup, bonus_percent)
                VALUES (1, 0, 0, 0)
            `, (err) => {
                if (err) logger.error('❌ Gagal insert default bonus_config:', err.message);
                else logger.info('✅ Default bonus_config dijamin ada');
            });

            // Inisialisasi tabel bonus_log
            db.run(`
                CREATE TABLE IF NOT EXISTS bonus_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    username TEXT,
                    amount INTEGER,
                    bonus INTEGER,
                    timestamp TEXT
                )
            `, (err) => {
                if (err) logger.error('❌ Gagal membuat tabel bonus_log:', err.message);
                else logger.info('✅ Tabel bonus_log siap');
            });

            // Inisialisasi tabel pending_deposits
            db.run(`
                CREATE TABLE IF NOT EXISTS pending_deposits (
                    unique_code TEXT PRIMARY KEY,
                    user_id INTEGER,
                    username TEXT,
                    amount INTEGER,
                    original_amount INTEGER,
                    timestamp INTEGER,
                    status TEXT,
                    qr_message_id INTEGER
                )
            `, (err) => {
                if (err) {
                    logger.error('❌ Gagal membuat tabel pending_deposits:', err.message);
                } else {
                    logger.info('✅ Tabel pending_deposits siap');
                }
            });

            // Inisialisasi tabel log_penjualan (dengan perbaikan)
            db.run(`
                CREATE TABLE IF NOT EXISTS log_penjualan (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    username TEXT,
                    nama_server TEXT,
                    tipe_akun TEXT,
                    harga INTEGER,
                    masa_aktif_hari INTEGER,
                    waktu_transaksi TEXT,
                    action_type TEXT,
                    user_role TEXT DEFAULT 'member'
                )
            `, (err) => {
                if (err) {
                    logger.error('❌ Gagal membuat tabel log_penjualan:', err.message);
                } else {
                    logger.info('✅ Tabel log_penjualan siap');
                    db.all("PRAGMA table_info(log_penjualan)", (err, columns) => { // Menggunakan db.all
                        if (err) {
                            logger.error('Error getting table info for log_penjualan:', err.message);
                            return;
                        }
                        if (columns && Array.isArray(columns)) {
                            const hasUserRoleColumn = columns.some(col => col.name === 'user_role');
                            if (!hasUserRoleColumn) {
                                db.run("ALTER TABLE log_penjualan ADD COLUMN user_role TEXT DEFAULT 'member'", (err) => {
                                    if (err) logger.error('Error adding user_role column to log_penjualan table:', err.message);
                                    else logger.info('✅ Added user_role column to log_penjualan table');
                                });
                            }
                        } else {
                            logger.warn('PRAGMA table_info(log_penjualan) did not return an array for columns.');
                        }
                    });
                }
            });

            // Inisialisasi tabel unlimited_trial_users
            db.run(`
                CREATE TABLE IF NOT EXISTS unlimited_trial_users (
                    user_id INTEGER PRIMARY KEY
                )
            `, (err) => {
                if (err) {
                    logger.error('❌ Gagal membuat tabel unlimited_trial_users:', err.message);
                } else {
                    logger.info('✅ Tabel unlimited_trial_users siap');
                }
            });
            
            db.run(`
                CREATE TABLE IF NOT EXISTS ui_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    show_trial_button INTEGER DEFAULT 1,
                    show_sewa_script_button INTEGER DEFAULT 1
                )
            `, (err) => {
                if (err) {
                    logger.error('❌ Gagal membuat tabel ui_config:', err.message);
                } else {
                    logger.info('✅ Tabel ui_config siap');
                }
            });

            db.run(`
                INSERT OR IGNORE INTO ui_config (id, show_trial_button, show_sewa_script_button)
                VALUES (1, 1, 1)
            `, (err) => {
                if (err) {
                    logger.error('❌ Gagal insert default ui_config:', err.message);
                } else {
                    logger.info('✅ Default ui_config dijamin ada');
                }
            });
            
            db.all(`PRAGMA table_info(ui_config)`, (err, columns) => {
                if (err) {
                    logger.error('❌ Gagal ambil info kolom ui_config:', err.message);
                    return;
                }

                const hasSewaScriptColumn = columns.some(col => col.name === 'show_sewa_script_button');
                if (!hasSewaScriptColumn) {
                    db.run(`ALTER TABLE ui_config ADD COLUMN show_sewa_script_button INTEGER DEFAULT 1`, (err) => {
                        if (err) {
                            logger.error('❌ Gagal menambah kolom show_sewa_script_button:', err.message);
                        } else {
                            logger.info('✅ Kolom show_sewa_script_button ditambahkan ke ui_config');
                        }
                    });
                } else {
                    logger.info('ℹ️ Kolom show_sewa_script_button sudah tersedia di ui_config');
                }
            });
             
            // Inisialisasi tabel reseller_config
            
            db.run(`
                CREATE TABLE IF NOT EXISTS reseller_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    discount_percent INTEGER DEFAULT 0
                )
            `, (err) => {
                if (err) logger.error('❌ Gagal membuat tabel reseller_config:', err.message);
                else logger.info('✅ Tabel reseller_config siap');
            });

            db.run(`
                INSERT OR IGNORE INTO reseller_config (id, discount_percent)
                VALUES (1, 0)
            `, (err) => {
                if (err) logger.error('❌ Gagal insert default reseller_config:', err.message);
                else logger.info('✅ Default reseller_config dijamin ada');
            });

            // Inisialisasi tabel topup_log
            db.run(`
              CREATE TABLE IF NOT EXISTS topup_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                username TEXT,
                amount INTEGER,
                method TEXT,
                waktu TEXT
              )
            `, (err) => {
              if (err) logger.error('❌ Gagal membuat tabel topup_log:', err.message);
              else logger.info('✅ Tabel topup_log siap');
            });

            // Inisialisasi tabel Server
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
                logger.error('Kesalahan membuat tabel Server:', err.message);
              } else {
                logger.info('Server table created or already exists');
              }
            });

            // Inisialisasi tabel users (dengan perbaikan PRAGMA)
            db.run(`CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER UNIQUE,
              saldo INTEGER DEFAULT 0,
              role TEXT DEFAULT 'member',
              CONSTRAINT unique_user_id UNIQUE (user_id)
            )`, (err) => {
              if (err) {
                logger.error('Kesalahan membuat tabel users:', err.message);
              } else {
                logger.info('Users table created or already exists');
                db.all("PRAGMA table_info(users)", (err, columns) => { // Menggunakan db.all
                  if (err) {
                    logger.error('Error getting table info:', err.message);
                    return;
                  }
                  if (columns && Array.isArray(columns)) {
                      const hasRoleColumn = columns.some(col => col.name === 'role');
                      if (!hasRoleColumn) {
                          db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member'", (err) => {
                              if (err) logger.error('Error adding role column to users table:', err.message);
                              else logger.info('✅ Added role column to users table');
                          });
                      }
                  } else {
                      logger.warn('PRAGMA table_info(users) did not return an array for columns.');
                  }
                });
              }
            });

            // Inisialisasi tabel TrialLog
            db.run(`
              CREATE TABLE IF NOT EXISTS TrialLog (
                user_id INTEGER,
                date TEXT,
                count INTEGER DEFAULT 0,
                UNIQUE(user_id, date)
            )
            `);

        }); // End of db.serialize
    }
});

const lastMenus = {};
const userState = {};
logger.info('User state initialized');

// =======================
// Handler /start atau /menu
// =======================
// =======================
// Handler /start atau /menu
// =======================
bot.command(['start', 'menu'], async (ctx) => {
  logger.info('📥 Perintah /start atau /menu diterima');

  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  // Hapus pesan command user (biar bersih)
  try { await ctx.telegram.deleteMessage(chatId, ctx.message.message_id); } catch (e) {}

  // Registrasi user di DB jika belum ada
  await new Promise((resolve) => {
    db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
      if (err) { logger.error('❌ Kesalahan saat memeriksa user_id:', err.message); resolve(); return; }
      if (!row) {
        db.run('INSERT INTO users (user_id, role) VALUES (?, ?)', [userId, 'member'], (err) => {
          if (err) logger.error('❌ Gagal menyimpan user_id:', err.message);
          else logger.info(`✅ User ID ${userId} berhasil disimpan`);
          resolve();
        });
      } else {
        logger.info(`ℹ️ User ID ${userId} sudah ada`);
        resolve();
      }
    });
  });

  // Kirim menu utama
  await sendMainMenu(ctx);
});
// --- AKHIR COMMAND /start atau /menu ---


// =======================
// Handler /admin
// =======================
bot.command('admin', async (ctx) => {
  logger.info('Admin menu requested');

  if (!adminIds.includes(ctx.from.id)) {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch (e) {}
    return ctx.reply('❌ Anda tidak memiliki izin untuk mengakses menu admin.');
  }

  try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch (e) {}

  if (lastMenus[ctx.from.id]) {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, lastMenus[ctx.from.id]); } catch (e) {}
    delete lastMenus[ctx.from.id];
  }

  const sent = await sendAdminMenu(ctx);
  if (sent?.message_id) {
    lastMenus[ctx.from.id] = sent.message_id;
  }
});


// =======================
// Fungsi sendMainMenu
// =======================
async function sendMainMenu(ctx) {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  try {
    // Hapus menu lama jika ada
    if (lastMenus[userId]) {
      try {
        await ctx.telegram.deleteMessage(chatId, lastMenus[userId]);
        logger.info(`🧹 Menu lama user ${userId} dihapus`);
      } catch (e) {
        if (!e.message.includes('message to delete not found')) {
          console.warn(`⚠️ Gagal hapus menu lama user ${userId}:`, e.message);
        }
      }
      delete lastMenus[userId];
    }

    // Bersihkan state user
    delete userState[chatId];
    if (global.depositState && global.depositState[userId]) {
      delete global.depositState[userId];
    }

    // Ambil data user dari database
    const userName = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Member');
    let saldo = 0;
    let userRole = 'member';

    try {
      const row = await new Promise((resolve, reject) => {
        db.get('SELECT saldo, role FROM users WHERE user_id = ?', [userId], (err, row) => {
          if (err) reject(err); 
          else resolve(row);
        });
      });
      saldo = row ? row.saldo : 0;
      userRole = row ? row.role : 'member'; 
    } catch (e) {
      logger.error('Error fetching user data:', e.message);
      saldo = 0;
      userRole = 'member';
    }

    // Ambil statistik
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let userToday = 0, userWeek = 0, userMonth = 0;
    let globalToday = 0, globalWeek = 0, globalMonth = 0;

    try {
      // Statistik User
      [userToday, userWeek, userMonth] = await Promise.all([
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM log_penjualan WHERE user_id = ? AND waktu_transaksi >= ? AND action_type IN ("create","renew")', 
            [userId, todayStart], (err, row) => resolve(row ? row.count : 0));
        }),
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM log_penjualan WHERE user_id = ? AND waktu_transaksi >= ? AND action_type IN ("create","renew")', 
            [userId, weekStart], (err, row) => resolve(row ? row.count : 0));
        }),
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM log_penjualan WHERE user_id = ? AND waktu_transaksi >= ? AND action_type IN ("create","renew")', 
            [userId, monthStart], (err, row) => resolve(row ? row.count : 0));
        })
      ]);

      // Statistik Global
      [globalToday, globalWeek, globalMonth] = await Promise.all([
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM log_penjualan WHERE waktu_transaksi >= ? AND action_type IN ("create","renew")', 
            [todayStart], (err, row) => resolve(row ? row.count : 0));
        }),
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM log_penjualan WHERE waktu_transaksi >= ? AND action_type IN ("create","renew")', 
            [weekStart], (err, row) => resolve(row ? row.count : 0));
        }),
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM log_penjualan WHERE waktu_transaksi >= ? AND action_type IN ("create","renew")', 
            [monthStart], (err, row) => resolve(row ? row.count : 0));
        })
      ]);
    } catch (e) {
      logger.error('Error fetching statistics:', e.message);
    }

    // Jumlah pengguna bot
    let jumlahPengguna = 0;
    let jumlahServer = 0;
    try {
      const [userCount, serverCount] = await Promise.all([
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) AS count FROM users', (err, row) => {
            if (err) resolve(0); else resolve(row.count);
          });
        }),
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) AS count FROM Server', (err, row) => {
            if (err) resolve(0); else resolve(row.count);
          });
        })
      ]);
      jumlahPengguna = userCount;
      jumlahServer = serverCount;
    } catch (e) {
      logger.error('Gagal ambil data jumlah user/server:', e.message);
    }

    // Ambil konfigurasi UI
    const [tombolTrialAktif, tombolSewaScriptAktif, isUnlimited] = await Promise.all([
      new Promise((resolve) => {
        db.get('SELECT show_trial_button FROM ui_config WHERE id = 1', (err, row) => {
          if (err) resolve(false);
          else resolve(row?.show_trial_button === 1);
        });
      }),
      new Promise((resolve) => {
        db.get('SELECT show_sewa_script_button FROM ui_config WHERE id = 1', (err, row) => {
          if (err) resolve(false);
          else resolve(row?.show_sewa_script_button === 1);
        });
      }),
      new Promise((resolve) => {
        db.get('SELECT * FROM unlimited_trial_users WHERE user_id = ?', [userId], (err, row) => {
          if (err) resolve(false);
          else resolve(row != null);
        });
      })
    ]);

    const isAdmin = adminIds.includes(userId);
    const bolehLihatTrial = tombolTrialAktif || isUnlimited || isAdmin;

    // Ambil username admin
    let adminUsername = 'Admin';
    try {
      const adminChat = await bot.telegram.getChat(ADMIN);
      if (adminChat.username) {
        adminUsername = adminChat.username;
      }
    } catch (e) {
      adminUsername = 'Admin';
      logger.warn('⚠️ Gagal mengambil username admin:', e.message);
    }

    // Format waktu dan tanggal
    const uptime = os.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const uptimeFormatted = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const currentDay = dayNames[now.getDay()];
    const currentDate = new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(now);
    const timeNow = now.toTimeString().split(' ')[0];

    // Tentukan status user
    let statusText = '';
    if (isAdmin) statusText = `👑 <b>ꜱᴛᴀᴛᴜꜱ:</b> <code>Admin</code>`;
    else if (userRole === 'reseller') statusText = `🏆 <b>ꜱᴛᴀᴛᴜꜱ:</b> <code>Reseller</code>`;
    else statusText = `👤 <b>ꜱᴛᴀᴛᴜꜱ:</b> <code>Member</code>`;

    // Buat pesan utama
    const messageText = `
╭─ <b>⚡ Bot VPN ${NAMA_STORE} ⚡</b>
├ Bot VPN Premium dengan sistem otomatis untuk
├ pembelian layanan VPN berkualitas tinggi
└ Dapatkan akses internet cepat & aman dengan layanan VPN terpercaya!

<b>Hai, Member <code>${userName}</code>!</b>
ID: <code>${userId}</code>
Saldo: <code>Rp ${saldo.toLocaleString('id-ID')}</code>

<blockquote>
📊 <b>Statistik Anda</b>
• Hari Ini: ${userToday} akun
• Minggu Ini: ${userWeek} akun
• Bulan Ini: ${userMonth} akun

🌐 <b>Statistik Global</b>
• Hari Ini: ${globalToday} akun
• Minggu Ini: ${globalWeek} akun
• Bulan Ini: ${globalMonth} akun
</blockquote>

👥 Pengguna BOT: ${jumlahPengguna}
🖥️ Server: ${jumlahServer}
⏱️ Bot Aktif: ${uptimeFormatted}
──────────────────────────────`;


    // Buat keyboard
    const keyboard = [];
    if (bolehLihatTrial) keyboard.push([{ text: '💠 Trial Akun', callback_data: 'service_trial' }]);
    keyboard.push([{ text: '✏️ Buat Akun', callback_data: 'service_create' }, { text: '♻️ Renew Akun', callback_data: 'service_renew' }]);
    if (tombolSewaScriptAktif) keyboard.push([{ text: '🛒 Sewa Script', callback_data: 'service_sewascript' }]);
    keyboard.push([{ text: '💰 TopUp Saldo', callback_data: 'menu_topup' }]);

    // Kirim atau edit message
    let sentMessage = null;
    if (ctx.updateType === 'callback_query' && ctx.callbackQuery?.message) {
      try {
        const edited = await ctx.editMessageText(messageText, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: keyboard }
        });
        sentMessage = edited;
        logger.info(`✅ Menu utama diedit untuk user ${userId}`);
      } catch (error) {
        if (
          error.response?.error_code === 400 &&
          (error.response.description.includes('message is not modified') ||
           error.response.description.includes('message to edit not found') ||
           error.response.description.includes("message can't be edited"))
        ) {
          logger.info(`ℹ️ Edit message diabaikan untuk user ${userId}, kirim ulang menu baru`);
          sentMessage = await sendNewMenu(ctx, messageText, keyboard, userId);
        } else {
          logger.error(`❌ Error edit menu untuk user ${userId}:`, error.message);
          sentMessage = await sendNewMenu(ctx, messageText, keyboard, userId);
        }
      }
    } else {
      sentMessage = await sendNewMenu(ctx, messageText, keyboard, userId);
    }

    // Pastikan selalu return message_id
    if (sentMessage?.message_id) {
      lastMenus[userId] = sentMessage.message_id;
      return sentMessage;
    } else {
      logger.warn(`⚠️ sendMainMenu tidak mengembalikan message_id untuk user ${userId}, kirim ulang menu`);
      const resent = await sendNewMenu(ctx, messageText, keyboard, userId);
      if (resent?.message_id) lastMenus[userId] = resent.message_id;
      return resent;
    }

  } catch (error) {
    logger.error(`❌ Error fatal di sendMainMenu untuk user ${userId}:`, error.message);
    try {
      const fallback = await ctx.reply('⚠️ Gagal menampilkan menu utama, coba /menu.');
      return fallback;
    } catch (e) {
      logger.error(`❌ Gagal kirim fallback untuk user ${userId}:`, e.message);
      return null;
    }
  }
}

// =======================
// Helper kirim menu baru
// =======================
async function sendNewMenu(ctx, text, keyboard, userId) {
  try {
    const sentMessage = await ctx.reply(text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: keyboard }
    });
    lastMenus[userId] = sentMessage.message_id; // simpan message_id
    logger.info(`✅ Menu utama baru dikirim untuk user ${userId}`);
    return sentMessage; // penting agar sendMainMenu punya message_id
  } catch (e) {
    logger.error(`❌ Gagal kirim menu baru untuk user ${userId}:`, e.message);
    return null;
  }
}



bot.command('hapuslog', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) return ctx.reply('Tidak ada izin!');
  try {
    if (fs.existsSync('bot-combined.log')) fs.unlinkSync('bot-combined.log');
    if (fs.existsSync('bot-error.log')) fs.unlinkSync('bot-error.log');
    ctx.reply('Log berhasil dihapus.');
    logger.info('Log file dihapus oleh admin.');
  } catch (e) {
    ctx.reply('Gagal menghapus log: ' + e.message);
    logger.error('Gagal menghapus log: ' + e.message);
  }
});

// [UPDATE: Perintah /helpadmin yang diperbarui]
bot.command('helpadmin', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }
  const helpMessage = `
*📋 Daftar Perintah:*

1. /start - Mengaktifkan bot.
2. /menu - Menampilkan daftar menu bot.
3. /admin - Menampilkan fitur-fitur admin.
4. /broadcast - Kirim pesan siaran ke semua pengguna.
5. /addserver - Menambahkan server baru.
6. /addsaldo - Menambahkan saldo ke akun pengguna.
7. /kurangisaldo - Mengurangi saldo user.
8. /resetsaldo - Mengatur ulang saldo user.
9. /listsaldo - Menampilkan daftar saldo user.
10. /ceksaldo - Melihat saldo user.
11. /editharga - Mengedit harga layanan.
12. /editnama - Mengedit nama server.
13. /editdomain - Mengedit domain server.
14. /editauth - Mengedit auth server.
15. /editlimitquota - Mengedit batas quota server.
16. /editlimitip - Mengedit batas IP server.
17. /editlimitcreate - Mengedit batas pembuatan akun server.
18. /edittotalcreate - Mengedit total pembuatan akun server.
19. /hapuslog - Menghapus log bot.
20. /unlimitedtrial - Memberikan akses trial unlimited ke user.
21. /removeunlimitedtrial - Mencabut akses trial unlimited dari user.
22. /listunlimitedtrial - Melihat daftar user yang memiliki trial unlimited.
23. /setreseller - Mengubah role user menjadi reseller.
24. /unsetreseller - Mengubah role reseller menjadi member biasa.
25. /listreseller - Melihat daftar semua reseller.
26. /setdiskonreseller - Mengatur persentase diskon untuk reseller.
27. /resetdiskonreseller - Mereset persentase diskon reseller ke 0%.
28. /helpadmin - Menampilkan daftar perintah admin.

📝 *Catatan:* Gunakan perintah ini dengan format yang benar untuk menghindari kesalahan.
`;
  ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});

bot.command('broadcast', async (ctx) => {
  const userId = ctx.message.from.id;

  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const reply = ctx.message.reply_to_message;
  const inputText = ctx.message.text.split(' ').slice(1).join(' ');

  if (!reply && !inputText) {
    return ctx.reply(
      '📌 *Cara menggunakan perintah broadcast:*\n\n' +
      '1. Balas pesan (teks/gambar/video/dokumen) lalu ketik /broadcast untuk menyiarkan media tersebut\n' +
      '2. Atau langsung kirim `/broadcast Pesanmu` untuk broadcast teks biasa\n\n' +
      'Contoh:\n`/broadcast Hallo semua!`',
      { parse_mode: 'Markdown' }
    );
  }

  db.all("SELECT user_id FROM users", [], async (err, rows) => {
    if (err) {
      logger.error('❌ DB Error saat ambil user untuk broadcast:', err);
      return ctx.reply('⚠️ Gagal mengambil daftar pengguna.');
    }

    let success = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        let sent;

        if (reply && reply.message_id) {
          // Broadcast media dengan copyMessage
          sent = await bot.telegram.copyMessage(row.user_id, ctx.chat.id, reply.message_id);
        } else if (inputText) {
          // Broadcast teks + tombol URL
          sent = await bot.telegram.sendMessage(row.user_id, inputText, {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "🌐 WhatsApp Admin", url: `https://wa.me/${ADMIN_WA}` }
                ]
              ]
            }
          });
        }

        // === 2) PIN PESAN YANG BARU DIKIRIM ===
        // Antisipasi bentuk return: copyMessage balikin { message_id: n }
        // sendMessage balikin object Message penuh
        const messageIdToPin = sent?.message_id || sent;
        if (messageIdToPin) {
          try {
            await bot.telegram.pinChatMessage(row.user_id, messageIdToPin, {
              disable_notification: false
            });
            logger.info(`📌 Pesan dipin di chat ${row.user_id}`);
          } catch (e) {
            // Kalau targetnya user private → gagal pin (dilewatin aja)
            logger.debug(`Skip pin untuk ${row.user_id} (kemungkinan private chat)`);
          }
        }

        success++;
        logger.info(`✅ Broadcast sukses ke ${row.user_id}`);
      } catch (error) {
        failed++;

        if (error.response && error.response.error_code === 403) {
          logger.warn(`🚫 User ${row.user_id} blokir bot / belum start`);
        } else if (error.response && error.response.error_code === 429) {
          const retryAfter = error.response.parameters?.retry_after || 5;
          logger.warn(`⏳ Telegram rate limit: tunggu ${retryAfter} detik`);
          await new Promise(resolve => setTimeout(resolve, (retryAfter + 1) * 1000));
        } else {
          logger.warn(`❌ Gagal broadcast/pin ke ${row.user_id}: ${error.message}`);
        }
      }

      // Delay antar user (hindari flood)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    ctx.reply(`📣 Broadcast selesai!\n✅ Berhasil: ${success}\n❌ Gagal: ${failed}`);
  });
});

function formatRupiah(angka) {
  return `Rp${(angka || 0).toLocaleString('id-ID')}`;
}
// === Handler tombol kembali ke menu utama ===
// === Handler tombol kembali ke menu utama (fix delete + reply) ===

bot.action(/^batal_topup_(.+)$/, async (ctx) => {
  const uniqueCode = ctx.match[1];
  const deposit = global.pendingDeposits[uniqueCode];

  if (!deposit) {
    return ctx.answerCbQuery('Transaksi sudah tidak aktif atau telah dibatalkan.', { show_alert: true });
  }

  try {
    // Hapus pesan QR
    if (deposit.qrMessageId) {
      try {
        await bot.telegram.deleteMessage(deposit.userId, deposit.qrMessageId);
      } catch (e) {}
    }

    // Hapus dari pending
    delete global.pendingDeposits[uniqueCode];
    await deletePendingDeposit(uniqueCode);

    await ctx.answerCbQuery('Topup dibatalkan.');

    // ===== Kirim pesan dengan tombol kembali =====
    await ctx.reply('❌ Topup QRIS Orkut telah dibatalkan. Silahkan topup ulang jika ingin mencoba lagi.', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Kembali ke Menu Top-up', callback_data: 'menu_topup' }]
        ]
      }
    });
    // =============================================

    // Tambahan: hapus pesan command user (jika diperlukan)
    try {
      const chatId = ctx.chat.id;
      const userId = ctx.from.id;
      // Pastikan ctx.message ada (atau gunakan ctx.update.callback_query.message jika akses via callback)
      const messageId = ctx.update.callback_query.message?.message_id;
      if (messageId) {
        await ctx.telegram.deleteMessage(chatId, messageId);
        logger.info(`🧹 Pesan command user ${userId} berhasil dihapus`);
      }
    } catch (e) {
      const userId = ctx.from.id;
      console.warn(`⚠️ Tidak bisa hapus pesan command user ${userId}:`, e.message);
    }

  } catch (e) {
    logger.error('Gagal batal topup:', e);
    await ctx.answerCbQuery('Gagal batal topup.', { show_alert: true });
  }
});

bot.action('statistik_penjualan', async (ctx) => {
  await ctx.answerCbQuery();

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const startOfWeek = new Date(new Date().setDate(today.getDate() - today.getDay())).toISOString(); // Minggu
  const startOf7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  db.all(`
    SELECT tipe_akun, COUNT(*) AS jumlah, SUM(harga) AS total_harga
    FROM log_penjualan
    GROUP BY tipe_akun
  `, [], (err, rows) => {
    if (err || rows.length === 0) {
      return ctx.reply('⚠️ Belum ada data penjualan.');
    }

    let totalAkun = 0;
    let totalUang = 0;
    const hasil = rows.map(r => {
      totalAkun += r.jumlah;
      totalUang += r.total_harga;
      return `📦 *${r.tipe_akun.toUpperCase()}*\nJumlah Terjual: ${r.jumlah}\nTotal: ${formatRupiah(r.total_harga)}`;
    }).join('\n\n');

    db.get(`SELECT SUM(harga) AS total FROM log_penjualan WHERE waktu_transaksi >= ?`, [startOfToday], (err1, todayRow) => {
    db.get(`SELECT SUM(harga) AS total FROM log_penjualan WHERE waktu_transaksi >= ?`, [startOf7Days], (err2, week7Row) => {
    db.get(`SELECT SUM(harga) AS total FROM log_penjualan WHERE waktu_transaksi >= ?`, [startOfWeek], (err3, weekRow) => {
    db.get(`SELECT SUM(harga) AS total FROM log_penjualan WHERE waktu_transaksi >= ?`, [startOfMonth], (err4, monthRow) => {

      const totalToday = todayRow?.total || 0;
      const total7Days = week7Row?.total || 0;
      const totalWeek = weekRow?.total || 0;
      const totalMonth = monthRow?.total || 0;

      const message =
        `📊 *Statistik Penjualan per Tipe Akun:*\n\n${hasil}\n\n` +
        `🧾 *Total Semua Akun Terjual:* ${totalAkun}\n` +
        `💰 *Total Uang Masuk:* ${formatRupiah(totalUang)}\n\n` +
        `📅 *Hari Ini:* ${formatRupiah(totalToday)}\n` +
        `📈 *7 Hari Terakhir:* ${formatRupiah(total7Days)}\n` +
        `🗓️ *Minggu Ini:* ${formatRupiah(totalWeek)}\n` +
        `📆 *Bulan Ini:* ${formatRupiah(totalMonth)}`;

      ctx.reply(message, { parse_mode: 'Markdown' });

    }); }); }); });
  });
});
bot.command('addsaldo', async (ctx) => {
  const userId = ctx.from.id;
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
          logger.error('⚠️ Kesalahan saat memeriksa `user_id`:', err.message);
          return ctx.reply('⚠️ Kesalahan saat memeriksa `user_id`.', { parse_mode: 'Markdown' });
      }

      if (!row) {
          return ctx.reply('⚠️ `user_id` tidak terdaftar.', { parse_mode: 'Markdown' });
      }

      db.run("UPDATE users SET saldo = saldo + ? WHERE user_id = ?", [amount, targetUserId], function(err) {
          if (err) {
              logger.error('⚠️ Kesalahan saat menambahkan saldo:', err.message);
              return ctx.reply('⚠️ Kesalahan saat menambahkan saldo.', { parse_mode: 'Markdown' });
          }

          if (this.changes === 0) {
              return ctx.reply('⚠️ Pengguna tidak ditemukan.', { parse_mode: 'Markdown' });
          }

          ctx.reply(`✅ Saldo sebesar \`${amount}\` berhasil ditambahkan untuk \`user_id\` \`${targetUserId}\`.`, { parse_mode: 'Markdown' });
      });
  });
});

// ========================= MENU TOPUP PILIHAN ==========================
bot.action('menu_topup', async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const userId = ctx.from.id;
    
    // ...lanjutkan kode seperti biasa...


    // Hapus pesan sebelumnya
    try {
      if (ctx.callbackQuery?.message?.message_id) {
        await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
      }
    } catch (err) {
      console.warn("⚠️ Gagal hapus pesan lama:", err.message);
    }

    // Ambil username admin
    let adminUsername = 'Admin';
    try {
      const adminChat = await bot.telegram.getChat(ADMIN);
      if (adminChat.username) adminUsername = adminChat.username;
    } catch (e) {
      console.warn('⚠️ Gagal ambil username admin:', e.message);
    }

    const NAMA_STORE = vars?.NAMA_STORE || 'XWANSTORE';
    const config = loadButtonConfig ? loadButtonConfig() : { topup_saldo: true };

    const keyboard = [];
    if (config.topup_saldo)
      keyboard.push([{ text: "💸 Topup QRIS VPNNexus", callback_data: "topup_saldo" }]);
    keyboard.push([{ text: "🔙 Kembali ke Menu Utama", callback_data: "send_main_menu" }]);

    // 🧭 Tampilan aman + small caps elegan
    const messageText = `
📦━━━━━━━━━━━━━━━━━━━━📦
      <b>⚡ ${NAMA_STORE} ⚡</b>
📦━━━━━━━━━━━━━━━━━━━━📦

💳 <b>ᴍᴇɴᴜ ᴛᴏᴘ-ᴜᴘ ꜱᴀʟᴅᴏ</b>  
ᴘɪʟɪʜ ᴍᴇᴛᴏᴅᴇ ᴛᴏᴘ-ᴜᴘ ʏᴀɴɢ ᴋᴀᴍᴜ ɪɴɢɪɴᴋᴀɴ ᴅɪ ʙᴀᴡᴀʜ ɪɴɪ ⤵️

┏━━━━━━━━━━━━━━━━━━━┓
┃ 💸 <b>Qʀɪꜱ Oʀᴋᴜᴛ</b> — ᴘʀᴏꜱᴇꜱ ᴀᴜᴛᴏᴍᴀᴛɪꜱ  
┃ 💸 <b>Qʀɪꜱ Sᴀᴡᴇʀɪᴀ</b> — ᴠᴇʀɪꜰɪᴋᴀꜱɪ ᴄᴇᴘᴀᴛ  
┗━━━━━━━━━━━━━━━━━━━┛

📘 <b>ᴛᴀᴛᴀ ᴄᴀʀᴀ ᴛᴏᴘ-ᴜᴘ</b>  
1️⃣ ᴋʟɪᴋ ᴛᴏᴍʙᴏʟ ᴍᴇᴛᴏᴅᴇ ᴘᴇᴍʙᴀʏᴀʀᴀɴ ᴅɪ ʙᴀᴡᴀʜ.  
2️⃣ ꜱᴄᴀɴ ᴋᴏᴅᴇ Qʀ ᴀᴛᴀᴜ ꜱᴀʟɪɴ ʟɪɴᴋ ᴘᴇᴍʙᴀʏᴀʀᴀɴ.  
3️⃣ ʟᴀᴋᴜᴋᴀɴ ᴘᴇᴍʙᴀʏᴀʀᴀɴ ꜱᴇꜱᴜᴀɪ ɴᴏᴍɪɴᴀʟ.  
4️⃣ ᴛᴜɴɢɢᴜ ±1 ᴍᴇɴɪᴛ, ꜱᴀʟᴅᴏ ᴀᴋᴀɴ ᴍᴀꜱᴜᴋ ᴀᴜᴛᴏᴍᴀᴛɪꜱ.  
5️⃣ ᴊɪᴋᴀ ʙᴇʟᴜᴍ ᴍᴀꜱᴜᴋ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ᴅᴇɴɢᴀɴ ʙᴜᴋᴛɪ ᴛʀᴀɴꜱᴀᴋꜱɪ.  

☎️ <b>ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ:</b>  
╰<a href="https://t.me/${adminUsername}">@${adminUsername}</a>

📦━━━━━━━━━━━━━━━━━━━━📦
     <code>🌐 ᴅɪᴋᴇʟᴏʟᴀ ᴏʟᴇʜ ${NAMA_STORE} ɴᴇᴛᴡᴏʀᴋ</code>
📦━━━━━━━━━━━━━━━━━━━━📦
`;


    const sent = await ctx.reply(messageText, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
      disable_web_page_preview: true
    });

    if (sent?.message_id) {
      lastMenus[ctx.from.id] = sent.message_id;
    }

  } catch (err) {
    console.error("❌ Error di menu_topup:", err);
    await ctx.reply("⚠️ Gagal menampilkan menu TopUp. Silakan coba lagi.");
  }
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
          logger.error('⚠️ Kesalahan saat menambahkan server:', err.message);
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
          logger.error('⚠️ Kesalahan saat mengedit harga server:', err.message);
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
          logger.error('⚠️ Kesalahan saat mengedit nama server:', err.message);
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
          logger.error('⚠️ Kesalahan saat mengedit domain server:', err.message);
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
          logger.error('⚠️ Kesalahan saat mengedit auth server:', err.message);
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
          logger.error('⚠️ Kesalahan saat mengedit quota server:', err.message);
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
          logger.error('⚠️ Kesalahan saat mengedit iplimit server:', err.message);
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
          logger.error('⚠️ Kesalahan saat mengedit batas_create_akun server:', err.message);
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
          logger.error('⚠️ Kesalahan saat mengedit total_create_akun server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit total_create_akun server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Total create akun server \`${domain}\` berhasil diubah menjadi \`${total_create_akun}\`.`, { parse_mode: 'Markdown' });
  });
});
async function handleServiceAction(ctx, action) {
  let keyboard;
  if (action === 'trial') {
    keyboard = [
      [{ text: '💠 SSH', callback_data: 'trial_ssh' }],
      [{ text: '💠 Vmess', callback_data: 'trial_vmess' }, { text: '💠 Vless', callback_data: 'trial_vless' }],
      [{ text: '💠 Trojan', callback_data: 'trial_trojan' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  } else if (action === 'create') {
    keyboard = [
      [{ text: '✨ SSH', callback_data: 'create_ssh' }],
      [{ text: '✨ Vmess', callback_data: 'create_vmess' }, { text: '✨ Vless', callback_data: 'create_vless' }],
      [{ text: '✨ Trojan', callback_data: 'create_trojan' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  } else if (action === 'sewascript') {
    keyboard = [
      [{ text: '🥇 Regist IP', callback_data: 'sewascript_daftar' }, { text: '🥈 Renew IP', callback_data: 'sewascript_perpanjang' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  } else if (action === 'renew') {
    keyboard = [
      [{ text: '♻️ SSH', callback_data: 'renew_ssh' }],
      [{ text: '♻️ Vmess', callback_data: 'renew_vmess' }, { text: '♻️ Vless', callback_data: 'renew_vless' }],
      [{ text: '♻️ Trojan', callback_data: 'renew_trojan' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  }
  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: keyboard
    });
    logger.info(`${action} service menu sent`);
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      await ctx.reply(`Pilih jenis layanan yang ingin Anda ${action}:`, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
      logger.info(`${action} service menu sent as new message`);
    } else {
      logger.error(`Error saat mengirim menu ${action}:`, error);
    }
  }
}

const BUTTON_CONFIG_FILE = './button_config.json';

function loadButtonConfig() {
  try {
    return JSON.parse(fs.readFileSync(BUTTON_CONFIG_FILE, 'utf8'));
  } catch (e) {
    return { topup_saldo: true };
  }
}

function saveButtonConfig(config) {
  fs.writeFileSync(BUTTON_CONFIG_FILE, JSON.stringify(config, null, 2));
}

bot.action('toggle_topup_saldo', async (ctx) => {
    await ctx.answerCbQuery();
    const config = loadButtonConfig();
    config.topup_saldo = !config.topup_saldo;
    saveButtonConfig(config);
    await sendAdminMenu(ctx);
});


bot.action(/^toggle_trial_btn_(on|off)$/, async (ctx) => {
  try {
    const match = ctx.match || [];
    const mode = match[1];

    // Log saat tombol diklik
    console.log(`Toggle tombol trial: ${ctx.from.id} ingin ${mode}`);

    if (!adminIds.includes(ctx.from.id)) return;

    const newStatus = mode === 'on' ? 1 : 0;

    db.run('UPDATE ui_config SET show_trial_button = ? WHERE id = 1', [newStatus], async (err) => {
      if (err) {
        logger.error('❌ Gagal update tombol trial:', err.message);
        return await ctx.answerCbQuery('❌ Gagal mengubah status.');
      }

      await ctx.answerCbQuery('✅ Status tombol trial diperbarui.');

      // Hapus pesan admin lama
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.callbackQuery.message.message_id);
      } catch (e) {}

      // Kirim ulang menu admin
      await sendAdminMenu(ctx);
    });
  } catch (error) {
    logger.error('❌ ERROR toggle_trial_btn:', error.message);
    await ctx.answerCbQuery('❌ Terjadi kesalahan.');
  }
});

bot.action(/toggle_sewascript_btn_(on|off)/, async (ctx) => {
    const action = ctx.match[1]; // "on" atau "off"
    const newValue = action === 'on' ? 1 : 0;

    db.run(`UPDATE ui_config SET show_sewa_script_button = ? WHERE id = 1`, [newValue], function (err) {
        if (err) {
            logger.error('❌ Gagal update show_sewa_script_button:', err.message);
            return ctx.answerCbQuery('Gagal mengubah status tombol.');
        }

        logger.info(`✅ Tombol Sewa Script diubah ke ${newValue === 1 ? 'ON' : 'OFF'}`);
        ctx.answerCbQuery(`Tombol Sewa Script ${newValue === 1 ? 'diaktifkan ✅' : 'dinonaktifkan ❌'}`);
        return sendAdminMenu(ctx); // Refresh tampilan menu admin
    });
});

async function sendAdminMenu(ctx) {
    const config = loadButtonConfig();
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;


    const showTrial = await new Promise((resolve) => {
    db.get('SELECT show_trial_button FROM ui_config WHERE id = 1', (err, row) => {
        if (err) {
            logger.error('❌ Gagal ambil show_trial_button:', err.message);
            return resolve(1);
        }
        if (!row) {
            logger.warn('⚠️ Row kosong untuk show_trial_button!');
            return resolve(1);
        }
        logger.debug(`✅ show_trial_button: ${row.show_trial_button}`);
        resolve(row.show_trial_button === 1 ? 1 : 0);
    });
});

const showSewaScript = await new Promise((resolve) => {
    db.get('SELECT show_sewa_script_button FROM ui_config WHERE id = 1', (err, row) => {
        if (err) {
            logger.error('❌ Gagal ambil show_sewa_script_button:', err.message);
            return resolve(1);
        }
        if (!row) {
            logger.warn('⚠️ Row kosong untuk show_sewa_script_button!');
            return resolve(1);
        }
        logger.debug(`✅ show_sewa_script_button: ${row.show_sewa_script_button}`);
        resolve(row.show_sewa_script_button === 1 ? 1 : 0);
    });
});

    const adminKeyboard = [
        [{ text: '✏️ Tambah Server', callback_data: 'addserver' }, { text: '❌ Hapus Server', callback_data: 'deleteserver' }],
        [{ text: '💲 Edit Harga', callback_data: 'editserver_harga' }, { text: '📝 Edit Nama', callback_data: 'nama_server_edit' }],
        [{ text: '🌐 Edit Domain', callback_data: 'editserver_domain' }, { text: '🔑 Edit Auth', callback_data: 'editserver_auth' }],
        [{ text: '📊 Edit Quota', callback_data: 'editserver_quota' }, { text: '📶 Edit Limit IP', callback_data: 'editserver_limit_ip' }],
        [{ text: '🔢 Edit Batas Create', callback_data: 'editserver_batas_create_akun' }, { text: '🔢 Edit Total Create', callback_data: 'editserver_total_create_akun' }],
        [{ text: '💵 Tambah Saldo', callback_data: 'addsaldo_user' }, { text: '📋 List Server', callback_data: 'listserver' }],
        [{ text: '♻️ Reset Server', callback_data: 'resetdb' }, { text: 'ℹ️ Detail Server', callback_data: 'detailserver' }],
        [{ text: '🎁 Set Bonus TopUp', callback_data: 'bonus_topup_setting' }, { text: '📜 Log Bonus TopUp', callback_data: 'log_bonus_topup' }],
        [{ text: `${config.topup_saldo ? '✅' : '❌'} Topup QRIS VPNNexus`, callback_data: 'toggle_topup_saldo' }],
        [{ text: '♻️ Reset Server', callback_data: 'resetdb' }, { text: 'ℹ️ Detail Server', callback_data: 'detailserver' }],
        [{text: `${showTrial ? '✅' : '❌'} Tombol Trial`, callback_data: `toggle_trial_btn_${showTrial ? 'off' : 'on'}`}, {text: `${showSewaScript ? '✅' : '❌'} Tombol Sewa Script`, callback_data: `toggle_sewascript_btn_${showSewaScript ? 'off' : 'on'}`}],
        [{ text: '📈 Hasil Penjualan', callback_data: 'statistik_penjualan' }, { text: '📑 Log Topup', callback_data: 'log_topup' }],
        [{ text: '👥 List Reseller', callback_data: 'listreseller' }],
        [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];

    const messageText = `Menu Admin:`;



    // Hapus pesan admin sebelumnya (opsional, jika ingin clean)
    if (typeof lastMenus !== 'undefined' && lastMenus[userId]) {
        try { await ctx.telegram.deleteMessage(chatId, lastMenus[userId]); } catch (e) {}
        delete lastMenus[userId];
    }

    // Jika callback, edit pesan, jika gagal kirim baru
    if (ctx.updateType === 'callback_query') {
        try {
            const sent = await ctx.editMessageText(messageText, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: adminKeyboard }
            });
            if (sent?.message_id && typeof lastMenus !== 'undefined') lastMenus[userId] = sent.message_id;
            return sent;
        } catch (error) {
            // Kalau gagal edit, lanjut kirim pesan baru
        }
    }

    // Kirim pesan baru jika bukan callback atau edit gagal
    const sent = await ctx.reply(messageText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: adminKeyboard }
    });
    if (sent?.message_id && typeof lastMenus !== 'undefined') lastMenus[userId] = sent.message_id;
    return sent;
}
bot.action('sewascript_daftar', async (ctx) => {
    try {
        await ctx.deleteMessage();
    } catch (e) {
        console.warn("Gagal menghapus pesan sebelumnya:", e.message);
    }

    userState[ctx.from.id] = { step: 'sewascript_daftar_pilih_bulan' };

    await ctx.reply('📅 Pilih Durasi Sewa Script:', {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '1 Bulan 10K', callback_data: 'daftar_1bln' },
                    { text: '2 Bulan 20K', callback_data: 'daftar_2bln' },
                    { text: '3 Bulan 30K', callback_data: 'daftar_3bln' }
                ],
                [{ text: '🔙 Kembali', callback_data: 'service_sewascript' }]
            ]
        }
    });
});
bot.action('sewascript_perpanjang', async (ctx) => {
    try {
        await ctx.deleteMessage();
    } catch (e) {
        console.warn("Gagal menghapus pesan sebelumnya:", e.message);
    }

    userState[ctx.from.id] = { step: 'sewascript_perpanjang_pilih_bulan' };

    await ctx.reply('📅 Pilih Durasi Perpanjangan Script:', {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '1 Bulan 10K', callback_data: 'perpanjang_1bln' },
                    { text: '2 Bulan 20K', callback_data: 'perpanjang_2bln' },
                    { text: '3 Bulan 30K', callback_data: 'perpanjang_3bln' }
                ],
                [{ text: '🔙 Kembali', callback_data: 'service_sewascript' }]
            ]
        }
    });
});
bot.action(/^daftar_(\d+)bln$/, async (ctx) => {
  try {
    await ctx.deleteMessage();
  } catch (e) {
    console.warn('Gagal hapus pesan tombol:', e.message);
  }

  const bulan = parseInt(ctx.match[1]);
  userState[ctx.from.id] = {
    step: 'sewascript_create_input',
    bulan
  };
  await ctx.reply('♂️ *Masukkan username:*', { parse_mode: 'Markdown' });
});

bot.action(/^perpanjang_(\d+)bln$/, async (ctx) => {
  try {
    await ctx.deleteMessage();
  } catch (e) {
    console.warn('Gagal hapus pesan tombol:', e.message);
  }

  const bulan = parseInt(ctx.match[1]);
  userState[ctx.from.id] = {
    step: 'sewascript_perpanjang_ip_manual',
    bulan
  };
  await ctx.reply('🌀 *Masukkan IP yang ingin diperpanjang:*', { parse_mode: 'Markdown' });
});
bot.action('service_sewascript', async (ctx) => {
  try {
    await ctx.answerCbQuery();
  } catch (e) {
    logger.warn('answerCbQuery error:', e.message);
  }
  await handleServiceAction(ctx, 'sewascript');
});

bot.action('toggle_sewascript_button', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.answerCbQuery('❌ Tidak diizinkan', { show_alert: true });
  }

  db.get('SELECT show_sewa_script_button FROM ui_config WHERE id = 1', (err, row) => {
    if (err) {
      logger.error('❌ Gagal baca tombol sewa script:', err.message);
      return ctx.answerCbQuery('⚠️ Gagal membaca status', { show_alert: true });
    }

    const current = row?.show_sewa_script_button === 1;
    const newStatus = current ? 0 : 1;

    db.run('UPDATE ui_config SET show_sewa_script_button = ? WHERE id = 1', [newStatus], (err) => {
      if (err) {
        logger.error('❌ Gagal update tombol sewa script:', err.message);
        return ctx.answerCbQuery('⚠️ Gagal mengubah status', { show_alert: true });
      }

      const statusText = newStatus === 1 ? '✅ Diaktifkan' : '🚫 Dinonaktifkan';
      ctx.answerCbQuery(`📜 Tombol Sewa Script ${statusText}`, { show_alert: true });

    });
  });
});
bot.action('service_create', async (ctx) => {
  await ctx.answerCbQuery();
  await handleServiceAction(ctx, 'create');
});
bot.action('trial_ssh', async (ctx) => {
  await ctx.answerCbQuery();
  await startSelectServer(ctx, 'trial', 'ssh');
});

bot.action('trial_vmess', async (ctx) => {
  await ctx.answerCbQuery();
  await startSelectServer(ctx, 'trial', 'vmess');
});

bot.action('trial_vless', async (ctx) => {
  await ctx.answerCbQuery();
  await startSelectServer(ctx, 'trial', 'vless');
});

bot.action('trial_trojan', async (ctx) => {
  await ctx.answerCbQuery();
  await startSelectServer(ctx, 'trial', 'trojan');
});

bot.action('trial_shadowsocks', async (ctx) => {
  await ctx.answerCbQuery();
  await startSelectServer(ctx, 'trial', 'shadowsocks');
});

bot.action('service_trial', async (ctx) => {
  await ctx.answerCbQuery();
  await handleServiceAction(ctx, 'trial');
});

bot.action('service_renew', async (ctx) => {
  await ctx.answerCbQuery();
  await handleServiceAction(ctx, 'renew');
});

// ==============================================
// 🔙 Handler tombol "Kembali ke Menu Utama"
// ==============================================
bot.action('send_main_menu', async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  try {
    await ctx.answerCbQuery();

    // Hapus menu lama kalau ada (biar bersih)
    if (lastMenus[userId]) {
      try {
        await ctx.telegram.deleteMessage(chatId, lastMenus[userId]);
        logger.info(`🧹 Menu lama user ${userId} dihapus (kembali ke menu utama)`);
      } catch (e) {
        // Abaikan error jika pesan sudah hilang
        if (!e.message.includes('message to delete not found')) {
          console.warn(`⚠️ Gagal hapus menu lama user ${userId}:`, e.message);
        }
      }
    }

    // Panggil fungsi menu utama
    const sent = await sendMainMenu(ctx);

    // Simpan ID pesan terakhir biar bisa dihapus di klik berikutnya
    if (sent?.message_id) {
      lastMenus[userId] = sent.message_id;
      logger.info(`✅ Menu utama baru dikirim ke user ${userId}`);
    } else {
      logger.warn(`⚠️ sendMainMenu tidak mengembalikan message_id untuk user ${userId}`);
      await ctx.reply('⚠️ Gagal menampilkan menu utama, coba /menu.');
    }

  } catch (error) {
    logger.error(`❌ Gagal handle tombol send_main_menu untuk user ${userId}:`, error.message);
    await ctx.reply('❌ Terjadi kesalahan saat memuat menu utama.\nSilakan ketik /menu untuk kembali.');
  }
});


bot.action('create_vmess', async (ctx) => {
  await ctx.answerCbQuery();
  await startSelectServer(ctx, 'create', 'vmess');
});

bot.action('create_vless', async (ctx) => {
  await ctx.answerCbQuery();
  await startSelectServer(ctx, 'create', 'vless');
});

bot.action('create_trojan', async (ctx) => {
  await ctx.answerCbQuery();
  await startSelectServer(ctx, 'create', 'trojan');
});

bot.action('create_shadowsocks', async (ctx) => {
  await ctx.answerCbQuery();
  await startSelectServer(ctx, 'create', 'shadowsocks');
});

bot.action('create_ssh', async (ctx) => {
  await ctx.answerCbQuery();
  await startSelectServer(ctx, 'create', 'ssh');
});

bot.action('renew_vmess', async (ctx) => {
  await ctx.answerCbQuery();
  await startSelectServer(ctx, 'renew', 'vmess');
});

bot.action('renew_vless', async (ctx) => {
  await ctx.answerCbQuery();
  await startSelectServer(ctx, 'renew', 'vless');
});

bot.action('renew_trojan', async (ctx) => {
  await ctx.answerCbQuery();
  await startSelectServer(ctx, 'renew', 'trojan');
});

bot.action('renew_shadowsocks', async (ctx) => {
  await ctx.answerCbQuery();
  await startSelectServer(ctx, 'renew', 'shadowsocks');
});

bot.action('renew_ssh', async (ctx) => {
  await ctx.answerCbQuery();
  await startSelectServer(ctx, 'renew', 'ssh');
});
async function startSelectServer(ctx, action, type, page = 0) {
  try {
    logger.info(`Memulai proses ${action} untuk ${type} di halaman ${page + 1}`);

    // Ambil role user dan diskon reseller
    const userId = ctx.from.id;
    const userRole = await new Promise((resolve, reject) => {
        db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.role : 'member');
        });
    });

    let resellerDiscount = 0;
    if (userRole === 'reseller') {
        resellerDiscount = await new Promise((resolve, reject) => {
            db.get('SELECT discount_percent FROM reseller_config WHERE id = 1', (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.discount_percent : 0);
            });
        });
    }
    // End of reseller discount fetch

    db.all('SELECT * FROM Server', [], async (err, servers) => {
      if (err) {
        logger.error('⚠️ Error fetching servers:', err.message);
        return ctx.reply('⚠️ *PERHATIAN!* Tidak ada server yang tersedia saat ini. Coba lagi nanti!', { parse_mode: 'Markdown' });
      }

      if (servers.length === 0) {
        logger.info('Tidak ada server yang tersedia');
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

      // Set userState untuk tracking step berikutnya
      if (action !== 'trial') {
        userState[ctx.chat.id] = { step: `${action}_username_${type}`, page: currentPage };
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
        let hargaPerHariTampilan = server.harga;
        // Terapkan diskon untuk tampilan jika user adalah reseller
        if (userRole === 'reseller' && resellerDiscount > 0) {
            hargaPerHariTampilan = Math.floor(server.harga * (100 - resellerDiscount) / 100);
        }

        const hargaPer30HariTampilan = hargaPerHariTampilan * 30;
        const isFull = server.total_create_akun >= server.batas_create_akun;
        return `━━━━━━━━━━━━━━━━━━━━━━\n` +
               `🌏 *${server.nama_server}*\n` +
               `━━━━━━━━━━━━━━━━━━━━━━\n` +
               `🏷️ Harga per hari: Rp${hargaPerHariTampilan}\n` + // Menggunakan harga yang disesuaikan
               `📅 Harga per 30 hari: Rp${hargaPer30HariTampilan}\n` + // Menggunakan harga yang disesuaikan
               `🌤 Quota: ${server.quota}GB\n` +
               `🚀 Limit IP: ${server.iplimit} IP\n` +
               (isFull ? `⚠️ *Server Penuh*` : `👥 Total Create Akun: ${server.total_create_akun}/${server.batas_create_akun}`);
      }).join('\n\n');

      if (ctx.updateType === 'callback_query') {
        try {
          await ctx.editMessageText(`📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages}):*\n\n${serverList}`, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'Markdown'
          });
        } catch (e) {
          await ctx.reply(`📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages}):*\n\n${serverList}`, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'Markdown'
          });
        }
      } else {
        await ctx.reply(`📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages}):*\n\n${serverList}`, {
          reply_markup: { inline_keyboard: keyboard },
          parse_mode: 'Markdown'
        });
      }
      // userState sudah di-set di atas, jangan override lagi
    });
  } catch (error) {
    logger.error(`❌ Error saat memulai proses ${action} untuk ${type}:`, error);
    await ctx.reply(`❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.`, { parse_mode: 'Markdown' });
  }
}

bot.command('unlimitedtrial', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('❌ Anda tidak memiliki izin.');
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 2 || isNaN(args[1])) {
    return ctx.reply('⚠️ Format salah. Gunakan: /unlimitedtrial <user_id>');
  }

  const targetUserId = parseInt(args[1]);

  if (adminIds.includes(targetUserId)) {
    return;
  }

  db.run('INSERT OR IGNORE INTO unlimited_trial_users (user_id) VALUES (?)', [targetUserId], function(err) {
    if (err) {
      logger.error('Gagal menambahkan user unlimited trial:', err.message);
      return ctx.reply('❌ Gagal menambahkan user unlimited trial.');
    }

    ctx.reply(`✅ User \`${targetUserId}\` sekarang bisa trial tanpa batas.`, { parse_mode: 'Markdown' });
  });
});

bot.command('listunlimitedtrial', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) return;

  const page = 1;
  showUnlimitedTrialPage(ctx, page);
});

bot.action(/^unlimitedtrial_(next|prev)_(\d+)$/, async (ctx) => {
  const direction = ctx.match[1];
  let page = parseInt(ctx.match[2]);

  page = direction === 'next' ? page + 1 : page - 1;
  if (page < 1) page = 1;

  await ctx.answerCbQuery();
  showUnlimitedTrialPage(ctx, page, ctx.callbackQuery.message.message_id);
});

// PENTING: GANTI SELURUH FUNGSI showUnlimitedTrialPage() dengan kode di bawah ini.

function showUnlimitedTrialPage(ctx, page = 1, messageId = null) {
  const limit = 10;
  const offset = (page - 1) * limit;

  // Make the callback async to use await
  db.all(`SELECT user_id FROM unlimited_trial_users ORDER BY user_id LIMIT ? OFFSET ?`, [limit, offset], async (err, rows) => {
    if (err) {
      logger.error('❌ Gagal mengambil daftar unlimited trial:', err.message);
      return ctx.reply('❌ Terjadi kesalahan.');
    }

    if (rows.length === 0) {
      return ctx.reply('📭 Tidak ada data pengguna unlimited trial.');
    }

    let text = `📋 *Daftar User Unlimited Trial (Halaman ${page}):*\n\n`;

    for (const [i, row] of rows.entries()) {
      const username = await getUsernameById(row.user_id);
      text += `${offset + i + 1}. 👤 \`@${username}\`\n🆔 \`${row.user_id}\`\n\n`;
    }

    db.get(`SELECT COUNT(*) AS total FROM unlimited_trial_users`, (err, countRow) => {
      const total = countRow?.total || 0;
      const totalPages = Math.ceil(total / limit);

      const buttons = [];
      if (page > 1) buttons.push({ text: '⏮️ Prev', callback_data: `unlimitedtrial_prev_${page}` });
      if (page < totalPages) buttons.push({ text: 'Next ⏭️', callback_data: `unlimitedtrial_next_${page}` });

      const replyOptions = {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: buttons.length ? [buttons] : []
        }
      };

      if (messageId) {
        ctx.telegram.editMessageText(ctx.chat.id, messageId, null, text, replyOptions).catch(() => {});
      } else {
        ctx.reply(text, replyOptions);
      }
    });
  });
}

bot.command('removeunlimitedtrial', (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) return;

  const args = ctx.message.text.split(' ');
  if (args.length !== 2 || isNaN(args[1])) {
    return ctx.reply('⚠️ Format salah. Gunakan: /removeunlimitedtrial <user_id>');
  }

  const targetId = parseInt(args[1]);

  db.run('DELETE FROM unlimited_trial_users WHERE user_id = ?', [targetId], function (err) {
    if (err) {
      logger.error('❌ Gagal menghapus user dari unlimited trial:', err.message);
      return ctx.reply('❌ Gagal menghapus user.');
    }

    if (this.changes === 0) {
      return ctx.reply(`ℹ️ User \`${targetId}\` tidak ditemukan di daftar unlimited.`, { parse_mode: 'Markdown' });
    }

    ctx.reply(`✅ Izin trial unlimited untuk user \`${targetId}\` telah dicabut.`, { parse_mode: 'Markdown' });
  });
});

// [UPDATE: Perintah /setreseller]
bot.command('setreseller', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 2) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/setreseller <user_id>`', { parse_mode: 'Markdown' });
  }

  const targetUserId = parseInt(args[1]);
  if (isNaN(targetUserId)) {
    return ctx.reply('⚠️ `user_id` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  if (adminIds.includes(targetUserId)) {
      return ctx.reply('⚠️ Tidak dapat mengubah role admin lain.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE users SET role = 'reseller' WHERE user_id = ?", [targetUserId], function(err) {
    if (err) {
      logger.error('❌ Kesalahan saat mengatur role reseller:', err.message);
      return ctx.reply('❌ Kesalahan saat mengatur role reseller.', { parse_mode: 'Markdown' });
    }
    if (this.changes === 0) {
      return ctx.reply('⚠️ Pengguna tidak ditemukan atau sudah menjadi reseller.', { parse_mode: 'Markdown' });
    }
    ctx.reply(`✅ Pengguna \`${targetUserId}\` berhasil diatur sebagai *Reseller*.`, { parse_mode: 'Markdown' });
    bot.telegram.sendMessage(targetUserId, '🎉 Selamat! Akun Anda telah diupgrade menjadi *Reseller*! Nikmati harga khusus dan fitur reseller.', { parse_mode: 'Markdown' }).catch(e => logger.warn(`Gagal kirim notif reseller ke ${targetUserId}: ${e.message}`));
  });
});

// [UPDATE: Perintah /unsetreseller]
bot.command('unsetreseller', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 2) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/unsetreseller <user_id>`', { parse_mode: 'Markdown' });
  }

  const targetUserId = parseInt(args[1]);
  if (isNaN(targetUserId)) {
    return ctx.reply('⚠️ `user_id` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  if (adminIds.includes(targetUserId)) {
      return ctx.reply('⚠️ Tidak dapat mengubah role admin lain.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE users SET role = 'member' WHERE user_id = ?", [targetUserId], function(err) {
    if (err) {
      logger.error('❌ Kesalahan saat mengatur role member:', err.message);
      return ctx.reply('❌ Kesalahan saat mengatur role member.', { parse_mode: 'Markdown' });
    }
    if (this.changes === 0) {
      return ctx.reply('⚠️ Pengguna tidak ditemukan atau sudah menjadi member.', { parse_mode: 'Markdown' });
    }
    ctx.reply(`✅ Pengguna \`${targetUserId}\` berhasil diubah menjadi *Member Biasa*.`, { parse_mode: 'Markdown' });
    bot.telegram.sendMessage(targetUserId, '😔 Informasi: Role akun Anda telah diubah menjadi *Member Biasa*. Jika Anda merasa ini adalah kesalahan, silakan hubungi admin.', { parse_mode: 'Markdown' }).catch(e => logger.warn(`Gagal kirim notif member ke ${targetUserId}: ${e.message}`));
  });
});

// [UPDATE: Perintah /listreseller]
bot.action('listreseller', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    await ctx.answerCbQuery('❌ Anda tidak memiliki izin untuk melihat daftar reseller.', { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();
  await sendPaginatedResellerList(ctx, 1);
});

bot.action(/^listreseller_(next|prev)_(\d+)$/, async (ctx) => {
  const direction = ctx.match[1];
  let page = parseInt(ctx.match[2]);

  page = direction === 'next' ? page + 1 : page - 1;
  if (page < 1) page = 1;

  await ctx.answerCbQuery();
  await sendPaginatedResellerList(ctx, page, ctx.callbackQuery.message.message_id);
});

// COMMAND: /listreseller
// ✅ Command utama: hanya 1 versi
bot.command('listreseller', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('❌ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  logger.info(`[LISTRESELLER] Admin ${userId} meminta daftar reseller halaman 1`);
  await sendPaginatedResellerList(ctx, 1);
});

// ✅ Navigasi tombol next/prev
bot.action(/^listreseller_(next|prev)_(\d+)$/, async (ctx) => {
  const direction = ctx.match[1];
  let page = parseInt(ctx.match[2]);

  page = direction === 'next' ? page + 1 : page - 1;
  if (page < 1) page = 1;

  await ctx.answerCbQuery();
  logger.info(`[LISTRESELLER] Navigasi ke halaman ${page}`);
  await sendPaginatedResellerList(ctx, page, ctx.callbackQuery.message.message_id);
});

async function sendPaginatedResellerList(ctx, page = 1, messageId = null) {
  const limit = 10;
  const offset = (page - 1) * limit;

  try {
    const resellers = await new Promise((resolve, reject) => {
      db.all(
        `SELECT user_id, saldo FROM users WHERE role = 'reseller' ORDER BY user_id LIMIT ? OFFSET ?`,
        [limit, offset],
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });

    const totalResellers = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) AS count FROM users WHERE role = 'reseller'`,
        (err, row) => (err ? reject(err) : resolve(row.count))
      );
    });

    if (resellers.length === 0) {
      const msg = '📭 Belum ada reseller terdaftar.';
      return messageId
        ? ctx.telegram.editMessageText(ctx.chat.id, messageId, null, msg)
        : ctx.reply(msg);
    }

    let message = `👥 *Daftar Reseller (Halaman ${page}):*\n\n`;
    for (const reseller of resellers) {
      // Panggil fungsi untuk mendapatkan username Telegram
      const username = await getUsernameById(reseller.user_id);
      
      message += `👤 \`@${username}\`\n🆔 \`${reseller.user_id}\`\n💰 Saldo: Rp${(reseller.saldo || 0).toLocaleString('id-ID')}\n\n`;
    }

    const totalPages = Math.ceil(totalResellers / limit);
    const navButtons = [];

    if (page > 1) {
      navButtons.push({ text: '⬅️ Prev', callback_data: `listreseller_prev_${page}` });
    }
    if (page < totalPages) {
      navButtons.push({ text: 'Next ➡️', callback_data: `listreseller_next_${page}` });
    }

    const replyOptions = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: navButtons.length > 0 ? [navButtons] : []
      }
    };

    if (messageId) {
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, message, replyOptions);
      } catch (e) {
        logger.error('❌ Gagal editMessageText:', e.stack || e.message || e);
        await ctx.reply(message, replyOptions);
      }
    } else {
      await ctx.reply(message, replyOptions);
    }

  } catch (err) {
    logger.error('❌ Gagal menampilkan daftar reseller:', err.stack || err.message || err);
    await ctx.reply('❌ Terjadi kesalahan saat mengambil daftar reseller.');
  }
}

// [UPDATE: Perintah /setdiskonreseller]
bot.command('setdiskonreseller', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 2 || isNaN(args[1]) || parseInt(args[1]) < 0 || parseInt(args[1]) > 100) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/setdiskonreseller <persen>` (angka antara 0-100)', { parse_mode: 'Markdown' });
  }

  const discountPercent = parseInt(args[1]);

  db.run("UPDATE reseller_config SET discount_percent = ? WHERE id = 1", [discountPercent], function(err) {
    if (err) {
      logger.error('❌ Kesalahan saat mengatur diskon reseller:', err.message);
      return ctx.reply('❌ Kesalahan saat mengatur diskon reseller.', { parse_mode: 'Markdown' });
    }
    ctx.reply(`✅ Diskon reseller berhasil diatur menjadi *${discountPercent}%*.`, { parse_mode: 'Markdown' });
  });
});

// [UPDATE: Perintah /resetdiskonreseller]
bot.command('resetdiskonreseller', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE reseller_config SET discount_percent = 0 WHERE id = 1", function(err) {
    if (err) {
      logger.error('❌ Kesalahan saat mereset diskon reseller:', err.message);
      return ctx.reply('❌ Kesalahan saat mereset diskon reseller.', { parse_mode: 'Markdown' });
    }
    ctx.reply('✅ Diskon reseller berhasil direset menjadi *0%*.', { parse_mode: 'Markdown' });
  });
});


bot.action(/navigate_(\w+)_(\w+)_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const [, action, type, page] = ctx.match;
  await startSelectServer(ctx, action, type, parseInt(page, 10));
});

bot.action(/^(create|renew|trial)_username_(vmess|vless|trojan|shadowsocks|ssh)_(.+)$/, async (ctx) => {
  await ctx.telegram.answerCbQuery(ctx.callbackQuery.id);

  const match = ctx.match || [];
  const action = match[1];
  const type = match[2];
  const serverId = match[3];

  if (!action || !type || !serverId) {
    return ctx.reply('❌ *Perintah tidak dikenali.*', { parse_mode: 'Markdown' });
  }

  if (action === 'trial') {
  const userId = ctx.from.id;
  const today = new Date().toISOString().split('T')[0];

  if (userId == ADMIN) {
    return await handleTrial(ctx, type, serverId);
  }

  db.get('SELECT batas_create_akun, total_create_akun FROM Server WHERE id = ?', [serverId], (err, server) => {
    if (err) {
      logger.error('❌ Error fetching server details:', err.message);
      return ctx.reply('❌ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
    }

    if (!server) {
      return ctx.reply('❌ *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
    }

    const { batas_create_akun, total_create_akun } = server;

    if (total_create_akun >= batas_create_akun) {
      return ctx.reply('❌ *Server penuh. Trial tidak dapat dibuat di server ini.*', { parse_mode: 'Markdown' });
    }

    db.get('SELECT count FROM TrialLog WHERE user_id = ? AND date = ?', [userId, today], async (err, row) => {
      if (err) {
        logger.error('❌ Error saat cek log trial:', err);
        return ctx.reply('❌ *Terjadi kesalahan saat memproses trial. Silahkan coba lagi nanti.*', { parse_mode: 'Markdown' });
      }

      const trialCount = row?.count || 0;

      db.get('SELECT * FROM unlimited_trial_users WHERE user_id = ?', [userId], async (err, result) => {
        if (err) {
          logger.error('❌ Error cek unlimited trial:', err.message);
          return ctx.reply('❌ Terjadi kesalahan saat memeriksa hak trial.', { parse_mode: 'Markdown' });
        }

        const isUnlimited = result != null;

        if (!isUnlimited && trialCount >= 2) {
          return ctx.reply('⚠️ *Kamu sudah trial hari ini, Gass Order* 😖', { parse_mode: 'Markdown' });
        }

        await handleTrial(ctx, type, serverId);

        if (!isUnlimited) {
          const newCount = trialCount + 1;
          db.run(`
            INSERT INTO TrialLog (user_id, date, count)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, date) DO UPDATE SET count = ?
          `, [userId, today, newCount, newCount]);
        }
      });
    });
  });

  } else {

    userState[ctx.chat.id] = { step: `username_${action}_${type}`, serverId, type, action };

    db.get('SELECT batas_create_akun, total_create_akun FROM Server WHERE id = ?', [serverId], async (err, server) => {
      if (err) {
        logger.error('⚠️ Error fetching server details:', err.message);
        return ctx.reply('❌ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
      }

      if (!server) {
        return ctx.reply('❌ *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
      }

      const { batas_create_akun, total_create_akun } = server;

      if (total_create_akun >= batas_create_akun) {
        return ctx.reply('❌ *Server penuh. Tidak dapat membuat akun baru di server ini.*', { parse_mode: 'Markdown' });
      }

      await ctx.reply('👤 *Masukkan username:*', { parse_mode: 'Markdown' });
    });
  }
});
async function handleTrial(ctx, type, serverId) {
  try {
    const username = `trial${Math.floor(Math.random() * 10000)}`;
    const password = Math.random().toString(36).slice(-6);
    const exp = 1;
    const quota = 1;
    const iplimit = 1;

    let msg;
    switch (type) {
      case 'vmess':
        msg = await trialvmess(username, exp, quota, iplimit, serverId);
        break;
      case 'vless':
        msg = await trialvless(username, exp, quota, iplimit, serverId);
        break;
      case 'trojan':
        msg = await trialtrojan(username, exp, quota, iplimit, serverId);
        break;
      case 'shadowsocks':
        msg = await trialshadowsocks(username, exp, quota, iplimit, serverId);
        break;
      case 'ssh':
        msg = await trialssh(username, password, exp, iplimit, serverId);
        break;
      default:
        msg = '❌ *Tipe layanan tidak dikenali.*';
    }

    if (msg) {
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    }

    // Kirim notif ke grup jika trial berhasil
    if (msg && !msg.includes('❌')) {
      try {
        const userId = ctx.from.id;
        const tgUsername = ctx.from.username ? `@${ctx.from.username}` : `user_${userId}`;
        const now = new Date();
        const tanggal = now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.');
        const waktu = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(/\./, ':') + ' WIB';

        // Ambil info server
        const server = await new Promise((resolve) => {
          db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, row) => resolve(row || {}));
        });

        const groupData = getBotGroupData();
        if (groupData?.chatId && groupData?.keyGroup) {
          const trialMsg =
`🎁 *TRIAL ACCOUNT* 🎁

\`\`\`
👤 Username     : ${tgUsername}
🆔 ID           : ${userId}

🌐 Server       : ${server.nama_server || '-'}
🔗 Domain/IP    : ${server.domain || '-'}
🙍 Nama Akun    : ${username}

📦 Produk       : ${type.toUpperCase()}
⚙️ Tipe         : Trial

📅 Tanggal      : ${tanggal}
⏰ Waktu        : ${waktu}
\`\`\`

📝 Catatan: Simpan nomor transaksi untuk support`;

          await axios.post(`https://api.telegram.org/bot${groupData.keyGroup}/sendMessage`, {
            chat_id: groupData.chatId,
            text: trialMsg,
            parse_mode: 'Markdown'
          });
        }
      } catch (e) {
        logger.warn('Gagal kirim notif trial ke grup:', e.message);
      }
    }

  } catch (error) {
    logger.error(`❌ Error trial ${type}:`, error);
    await ctx.reply('❌ *Gagal membuat akun trial. Silahkan coba lagi nanti.*', { parse_mode: 'Markdown' });
  } finally {
    delete userState[ctx.chat.id];
  }
}
function kaburMark(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

async function showLoading(ctx) {
  const waitMsg = await ctx.reply("⏳ Mohon menunggu.");

  const dots = [".", "..", "...", " "];
  let i = 0;

  const intervalId = setInterval(async () => {
    i = (i + 1) % dots.length;
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        waitMsg.message_id,
        null,
        `⏳ Mohon menunggu${dots[i]}`
      );
    } catch (e) {
      clearInterval(intervalId);
    }
  }, 1000);

  return { messageId: waitMsg.message_id, intervalId: intervalId };
}

bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const teks = ctx.message?.text?.trim();
    const state = userState[userId];

    if (typeof teks !== 'string' || teks.length === 0) {
        return;
    }

    if (teks.startsWith('/')) {
        return next();
    }

    console.log(`📩 Input dari ${userId}: ${ctx.message.text}`);
    logger.info(`📩 Input teks dari ${userId}: ${ctx.message.text}`);

    if (global.depositState && global.depositState[userId]?.action === 'request_amount_orkut') {
        const input = ctx.message.text.trim();
        const nominal = parseInt(input.replace(/[^\d]/g, ''), 10);

        if (isNaN(nominal) || nominal < 100) {
            return ctx.reply('❌ *Nominal tidak valid. Minimal Rp100.*', { parse_mode: 'Markdown' });
        }

        delete global.depositState[userId];

        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
        } catch (e) {
            logger.warn(`Gagal menghapus pesan input nominal dari user ${userId}: ${e.message}`);
        }

        if (lastMenus[userId]) {
          try {
            await ctx.telegram.deleteMessage(ctx.chat.id, lastMenus[userId]);
            delete lastMenus[userId];
          } catch (e) {
            logger.warn(`Gagal menghapus pesan permintaan nominal awal bot untuk user ${userId}: ${e.message}`);
          }
        }

        await processDeposit(ctx, nominal);
        return;
    }

    if (state && state.step === 'sewascript_create_input') {
        const username = ctx.message.text.trim();

        if (!/^[a-zA-Z0-9]{3,20}$/.test(username)) {
            return ctx.reply('❌ *Username tidak valid. Harus 3-20 karakter alfanumerik.*', { parse_mode: 'Markdown' });
        }

        userState[userId] = {
            step: 'sewascript_create_input_ip',
            username,
            bulan: state.bulan
        };

        await ctx.reply('🏷️ *Masukkan IP Address:*', { parse_mode: 'Markdown' });
        return;
    }

    if (state && state.step === 'sewascript_create_input_ip') {
        const ip = ctx.message.text.trim();
        const { username, bulan } = state;

        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
            return ctx.reply('❌ *Format IP tidak valid.* Masukkan IP seperti 123.45.67.89', { parse_mode: 'Markdown' });
        }

        const priceharga = 10000 * bulan;

        db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], async (err, user) => {
            if (err || !user) {
                logger.error(`Error mengambil saldo user ${userId} untuk sewa script:`, err?.message);
                return ctx.reply('❌ Terjadi kesalahan mengambil saldo pengguna.', { parse_mode: 'Markdown' });
            }

            if (user.saldo < priceharga) {
                logger.warn(`Saldo user ${userId} tidak cukup (Rp${user.saldo}) untuk sewa script Rp${priceharga}`);
                return ctx.reply('❌ *Saldo Anda tidak cukup.*', { parse_mode: 'Markdown' });
            }

            const { exec } = require('child_process');
            const cmd = `/usr/local/sbin/literegis ${username} ${bulan} ${ip}`;
            logger.info(`Menjalankan perintah sewa script untuk user ${userId}: ${cmd}`);
            const loadingState = await showLoading(ctx);
            const waitMsgId = loadingState.messageId;
            const intervalId = loadingState.intervalId;

            let outputMessage;
            let successScriptAction = false;

            try {
                const { error, stdout, stderr } = await new Promise((resolve) => {
                    exec(cmd, (error, stdout, stderr) => {
                        resolve({ error, stdout, stderr });
                    });
                });

                if (error) {
                    logger.error(`Error saat eksekusi literegis untuk user ${userId}:`, error.message);
                    outputMessage = `❌ Gagal daftar script:\n\n${stderr || error.message}`;
                } else if (/gagal|error/i.test(stdout)) {
                    logger.warn(`Literegis mengembalikan pesan gagal untuk user ${userId}:\n${stdout}`);
                    outputMessage = `❌ Gagal daftar script:\n\n${stdout}`;
                } else {
                    successScriptAction = true;
                    outputMessage = `✅ Pendaftaran IP Berhasil:\n${stdout}`;
                    logger.info(`✅ Literegis berhasil untuk user ${userId}`);
                }
            } catch (e) {
                logger.error(`Exception saat menjalankan literegis untuk user ${userId}:`, e.message);
                outputMessage = `❌ Terjadi kesalahan internal saat memproses pendaftaran script. Silakan coba lagi nanti.`;
            } finally {
                clearInterval(intervalId);
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsgId);
                } catch (e) {
                    logger.warn(`Gagal menghapus pesan loading untuk user ${userId}: ${e.message}`);
                }
            }

            try {
                await ctx.reply(outputMessage, { parse_mode: 'HTML' });
            } catch (e) {
                logger.error(`Gagal mengirim pesan hasil sewa script untuk user ${userId}:`, e.message);
            }

            if (successScriptAction) {
                db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [priceharga, userId], (errUpdateSaldo) => {
                    if (errUpdateSaldo) {
                        logger.error('⚠️ Kesalahan saat mengurangi saldo pengguna untuk sewa script (setelah sukses):', errUpdateSaldo.message);
                        bot.telegram.sendMessage(ADMIN, `🚨 *PERHATIAN: SALDO GAGAL DIKURANGI SETELAH SEWA SCRIPT SUKSES!*
User ID: \`${userId}\`
Username TG: \`@${ctx.from.username || 'N/A'}\`
Jenis: Sewa Script
Jumlah: Rp${priceharga.toLocaleString('id-ID')}
Pesan Error: ${errUpdateSaldo.message}
*SCRIPT MUNGKIN SUDAH TERDAFTAR TAPI SALDO BELUM TERPOTONG!*`, { parse_mode: 'Markdown' }).catch(e => logger.error("Gagal kirim notif darurat:", e.message));
                    } else {
                        logger.info(`✅ Saldo Rp${priceharga} berhasil dikurangi untuk user ${userId} (Sewa Script berhasil)`);
                    }
                });
            } else {
                logger.info(`⚠️ Saldo user ${userId} TIDAK dikurangi karena sewa script gagal.`);
            }
        });

        delete userState[userId];
        return;
    }

    if (state && state.step === 'sewascript_perpanjang_ip_manual') {
        const ip = ctx.message.text.trim();
        const bulan = state.bulan;

        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
            return ctx.reply('❌ *Format IP tidak valid.* Masukkan IP seperti 123.45.67.89', { parse_mode: 'Markdown' });
        }

        const priceharga = 10000 * bulan;

        db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], async (err, user) => {
            if (err || !user) {
                logger.error(`Error mengambil saldo user ${userId} untuk perpanjang script:`, err?.message);
                return ctx.reply('❌ Terjadi kesalahan mengambil saldo pengguna.', { parse_mode: 'Markdown' });
            }

            if (user.saldo < priceharga) {
                logger.warn(`Saldo user ${userId} tidak cukup (Rp${user.saldo}) untuk perpanjang script Rp${priceharga}`);
                return ctx.reply('❌ *Saldo Anda tidak cukup untuk memperpanjang.*', { parse_mode: 'Markdown' });
            }

            const { exec } = require('child_process');
            const jumlahHari = bulan * 30;
            const cmd = `/usr/local/sbin/liteextend ${ip} ${jumlahHari}`;
            logger.info(`Menjalankan perintah perpanjang script untuk user ${userId}: ${cmd}`);
            const loadingState = await showLoading(ctx);
            const waitMsgId = loadingState.messageId;
            const intervalId = loadingState.intervalId;

            let outputMessage;
            let successScriptAction = false;

            try {
                const { error, stdout, stderr } = await new Promise((resolve) => {
                    exec(cmd, (error, stdout, stderr) => {
                        resolve({ error, stdout, stderr });
                    });
                });

                if (error) {
                    logger.error(`Error saat eksekusi liteextend untuk user ${userId}:`, error.message);
                    outputMessage = `❌ Gagal memperpanjang script:\n\n${stderr || error.message}`;
                } else if (/gagal|error/i.test(stdout)) {
                    logger.warn(`Liteextend mengembalikan pesan gagal untuk user ${userId}:\n${stdout}`);
                    outputMessage = `❌ Gagal memperpanjang script:\n\n${stdout}`;
                } else {
                    successScriptAction = true;
                    outputMessage = `✅ Perpanjangan IP Berhasil:\n${stdout}`;
                    logger.info(`✅ Liteextend berhasil untuk user ${userId}`);
                }
            } catch (e) {
                logger.error(`Exception saat menjalankan liteextend untuk user ${userId}:`, e.message);
                outputMessage = `❌ Terjadi kesalahan internal saat memproses perpanjangan script. Silakan coba lagi nanti.`;
            } finally {
                clearInterval(intervalId);
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsgId);
                } catch (e) {
                    logger.warn(`Gagal menghapus pesan loading untuk user ${userId}: ${e.message}`);
                }
            }

            try {
                await ctx.reply(outputMessage, { parse_mode: 'HTML' });
            } catch (e) {
                logger.error(`Gagal mengirim pesan hasil perpanjang script untuk user ${userId}:`, e.message);
            }

            if (successScriptAction) {
                db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [priceharga, userId], (errUpdateSaldo) => {
                    if (errUpdateSaldo) {
                        logger.error('⚠️ Kesalahan saat mengurangi saldo pengguna untuk perpanjang script (setelah sukses):', errUpdateSaldo.message);
                        bot.telegram.sendMessage(ADMIN, `🚨 *PERHATIAN: SALDO GAGAL DIKURANGI SETELAH PERPANJANG SCRIPT SUKSES!*
User ID: \`${userId}\`
Username TG: \`@${ctx.from.username || 'N/A'}\`
Jenis: Perpanjang Script
Jumlah: Rp${priceharga.toLocaleString('id-ID')}
Pesan Error: ${errUpdateSaldo.message}
*SCRIPT MUNGKIN SUDAH DIPERPANJANG TAPI SALDO BELUM TERPOTONG!*`, { parse_mode: 'Markdown' }).catch(e => logger.error("Gagal kirim notif darurat:", e.message));
                    } else {
                        logger.info(`✅ Saldo Rp${priceharga} berhasil dikurangi untuk user ${userId} (Perpanjang Script berhasil)`);
                    }
                });
            } else {
                logger.info(`⚠️ Saldo user ${userId} TIDAK dikurangi karena perpanjang script gagal.`);
            }
        });

        delete userState[userId];
        return;
    }

    if (state && state.step === 'atur_bonus_input') {
        const [status, minStr, persenStr] = ctx.message.text.trim().split(/\s+/);
        const min = parseInt(minStr, 10);
        const persen = parseInt(persenStr, 10);

        if (!status || isNaN(min) || isNaN(persen)) {
            return ctx.reply('⚠️ Format salah. Gunakan: `on|off <minimal_topup> <persen_bonus>`\nContoh: `on 10000 25`', { parse_mode: 'Markdown' });
        }

        const enabled = status.toLowerCase() === 'on' ? 1 : 0;
        db.run('UPDATE bonus_config SET enabled = ?, min_topup = ?, bonus_percent = ? WHERE id = 1',
            [enabled, min, persen],
            (err) => {
                if (err) {
                    logger.error('❌ Gagal update bonus config:', err.message);
                    return ctx.reply('❌ Gagal menyimpan pengaturan bonus.');
                }
                ctx.reply(`✅ Bonus Top Up *${enabled ? 'Aktif' : 'Nonaktif'}*
📌 Minimal Top Up: Rp${min}
🎁 Bonus: ${persen}%`, {
                    parse_mode: 'Markdown'
                });
                delete userState[userId];
            }
        );
        return;
    }

    if (state && state.step.startsWith('username_')) {
        state.username = ctx.message.text.trim();
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
        if (action === 'create') {
            if (type === 'ssh') {
                userState[userId].step = `password_${state.action}_${state.type}`;
                await ctx.reply('🔑 *Masukkan password:*', { parse_mode: 'Markdown' });
            } else {
                userState[userId].step = `exp_${state.action}_${state.type}`;
                await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
            }
        } else if (action === 'renew') {
            userState[userId].step = `exp_${state.action}_${state.type}`;
            await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
        }
        return;
    }

    if (state && state.step.startsWith('password_')) {
        state.password = ctx.message.text.trim();
        if (!state.password) {
            return ctx.reply('❌ *Password tidak valid. Masukkan password yang valid.*', { parse_mode: 'Markdown' });
        }
        if (state.password.length < 1) {
            return ctx.reply('❌ *Password harus terdiri dari minimal 1 karakter.*', { parse_mode: 'Markdown' });
        }
        if (/[^a-zA-Z0-9]/.test(state.password)) {
            return ctx.reply('❌ *Password tidak boleh mengandung karakter khusus atau spasi.*', { parse_mode: 'Markdown' });
        }
        userState[userId].step = `exp_${state.action}_${state.type}`;
        await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
        return;
    }

    if (state && state.step.startsWith('exp_')) {
        const expInput = ctx.message.text.trim();
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
        state.exp = exp;

        db.get('SELECT quota, iplimit, harga, nama_server, domain FROM Server WHERE id = ?', [state.serverId], async (err, server) => {
            if (err) {
                logger.error('⚠️ Error fetching server details:', err.message);
                return ctx.reply('❌ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
            }

            if (!server) {
                return ctx.reply('❌ *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
            }

            const harga = server.harga;
            let totalHarga = harga * state.exp;

            const userRole = await new Promise((resolve) => {
                db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
                    resolve(row ? row.role : 'member');
                });
            });

            let resellerDiscount = 0;
            if (userRole === 'reseller') {
                resellerDiscount = await new Promise((resolve) => {
                    db.get('SELECT discount_percent FROM reseller_config WHERE id = 1', (err, row) => {
                        if (err) reject(err);
                        else resolve(row ? row.discount_percent : 0);
                    });
                });
                totalHarga = Math.floor(totalHarga * (100 - resellerDiscount) / 100);
            }

            db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], async (err, user) => {
                if (err) {
                    logger.error('⚠️ Kesalahan saat mengambil saldo pengguna:', err.message);
                    return ctx.reply('❌ *Terjadi kesalahan saat mengambil saldo pengguna.*', { parse_mode: 'Markdown' });
                }

                // Auto register user jika belum ada
                if (!user) {
                    await new Promise((resolve) => {
                        db.run('INSERT OR IGNORE INTO users (user_id, role, saldo) VALUES (?, ?, ?)',
                            [userId, 'member', 0], () => resolve());
                    });
                    user = { saldo: 0 };
                }

                const saldo = user.saldo;

                if (saldo < totalHarga) {
                    delete userState[userId];
                    return ctx.reply(`❌ *Saldo Anda tidak mencukupi untuk melakukan transaksi ini. Saldo Anda: Rp${saldo.toLocaleString('id-ID')}, Harga: Rp${totalHarga.toLocaleString('id-ID')}*`, { parse_mode: 'Markdown' });
                }

                let msg;
                let successAction = false;
                let actionTypeLabel = '';
                const loadingState = await showLoading(ctx);
                const waitMsgId = loadingState.messageId;
                const intervalId = loadingState.intervalId;

                try {
                    logger.info(`Mencoba ${state.action} ${state.type} untuk user ${userId} di server ${server.nama_server}`);
                    if (state.action === 'create') {
                        actionTypeLabel = 'Buat Akun';
                        switch (state.type) {
                            case 'vmess': msg = await createvmess(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'vless': msg = await createvless(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'trojan': msg = await createtrojan(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'shadowsocks': msg = await createshadowsocks(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'ssh': msg = await createssh(state.username, state.password, exp, server.iplimit, state.serverId); break;
                            default: msg = '❌ *Tipe layanan tidak dikenali.*'; break;
                        }
                    } else if (state.action === 'renew') {
                        actionTypeLabel = 'Perpanjang Akun';
                        switch (state.type) {
                            case 'vmess': msg = await renewvmess(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'vless': msg = await renewvless(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'trojan': msg = await renewtrojan(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'shadowsocks': msg = await renewshadowsocks(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'ssh': msg = await renewssh(state.username, exp, server.iplimit, state.serverId); break;
                            default: msg = '❌ *Tipe layanan tidak dikenali.*'; break;
                        }
                    }

                    if (msg && typeof msg === 'string' && !msg.toLowerCase().includes('gagal') && !msg.toLowerCase().includes('error')) {
                        successAction = true;
                        logger.info(`✅ Aksi ${actionTypeLabel} ${state.type} berhasil untuk user ${userId}.`);
                    } else {
                        logger.warn(`Aksi ${actionTypeLabel} ${state.type} mengembalikan pesan gagal/error untuk user ${userId}: ${msg}`);
                        msg = msg || `❌ Gagal ${actionTypeLabel} akun. Mohon coba lagi atau hubungi admin.`;
                    }
                } catch (e) {
                    logger.error(`Error saat memanggil fungsi ${actionTypeLabel} akun ${state.type} untuk user ${userId}:`, e.message);
                    msg = '❌ Terjadi kesalahan internal saat memproses akun Anda. Mohon coba lagi nanti.';
                    successAction = false;
                } finally {
                    clearInterval(intervalId);
                    try {
                        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsgId);
                    } catch (e) {
                        logger.warn(`Gagal menghapus pesan loading untuk user ${userId}: ${e.message}`);
                    }
                }

                if (!successAction) {
                    delete userState[userId];
                    return ctx.reply(msg, { parse_mode: 'Markdown' });
                }

                db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [totalHarga, userId], (err) => {
                    if (err) {
                        logger.error('⚠️ Kesalahan saat mengurangi saldo pengguna (setelah sukses API):', err.message);
                        bot.telegram.sendMessage(ADMIN, `🚨 *PERHATIAN: SALDO GAGAL DIKURANGI!*
User ID: \`${userId}\`
Username TG: \`@${ctx.from.username || 'N/A'}\`
Produk: ${state.type.toUpperCase()}
Jenis: ${actionTypeLabel}
Jumlah: Rp${totalHarga.toLocaleString('id-ID')}
Pesan Error: ${err.message}
*AKUN MUNGKIN SUDAH TERBUAT TAPI SALDO BELUM TERPOTONG!*`, { parse_mode: 'Markdown' }).catch(e => logger.error("Gagal kirim notif darurat:", e.message));

                    } else {
                        logger.info(`✅ Saldo Rp${totalHarga} berhasil dikurangi untuk user ${userId} (${actionTypeLabel} ${state.type})`);
                    }
                });

                db.run('UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?', [state.serverId], (err) => {
                    if (err) {
                        logger.error('⚠️ Kesalahan saat menambahkan total_create_akun (setelah sukses API):', err.message);
                    }
                });

                const userRoleForLog = await new Promise((resolve) => {
                    db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
                        resolve(row ? row.role : 'member');
                    });
                });

                db.run(`INSERT INTO log_penjualan (
                    user_id,
                    username,
                    nama_server,
                    tipe_akun,
                    harga,
                    masa_aktif_hari,
                    waktu_transaksi,
                    action_type,
                    user_role
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    ctx.from.id,
                    ctx.from.username || '',
                    server.nama_server || 'Unknown',
                    state.type,
                    totalHarga,
                    state.exp,
                    new Date().toISOString(),
                    state.action,
                    userRoleForLog
                ], (err) => {
                    if (err) {
                        logger.warn('⚠️ Gagal mencatat log penjualan (setelah sukses API):', err.message);
                    } else {
                        logger.info(`✅ Log penjualan dicatat: ${ctx.from.id} - ${state.type} - ${state.action} - Rp${totalHarga} - Role: ${userRoleForLog}`);
                    }
                });

                await afterAccountTransaction({
                    userId: userId,
                    username: ctx.from.username,
                    produk: state.type.toUpperCase(),
                    serverId: state.serverId,
                    jenis: actionTypeLabel,
                    durasi: state.exp,
                    accountUsername: state.username
                });

                await ctx.reply(msg, { parse_mode: 'Markdown' });
                delete userState[userId];
            });
        });
        return;
    }

    if (state && state.step === 'addserver') {
        const domain = ctx.message.text.trim();
        if (!domain) {
            return ctx.reply('⚠️ *Domain tidak boleh kosong.* Silahkan masukkan domain server yang valid.', { parse_mode: 'Markdown' });
        }
        userState[userId].step = 'addserver_auth';
        userState[userId].domain = domain;
        await ctx.reply('🔑 *Silahkan masukkan auth server:*', { parse_mode: 'Markdown' });
        return;
    } else if (state && state.step === 'addserver_auth') {
        const auth = ctx.message.text.trim();
        if (!auth) {
            return ctx.reply('⚠️ *Auth tidak boleh kosong.* Silahkan masukkan auth server yang valid.', { parse_mode: 'Markdown' });
        }
        userState[userId].step = 'addserver_nama_server';
        userState[userId].auth = auth;
        await ctx.reply('🏷️ *Silahkan masukkan nama server:*', { parse_mode: 'Markdown' });
        return;
    } else if (state && state.step === 'addserver_nama_server') {
        const nama_server = ctx.message.text.trim();
        if (!nama_server) {
            return ctx.reply('⚠️ *Nama server tidak boleh kosong.* Silahkan masukkan nama server yang valid.', { parse_mode: 'Markdown' });
        }
        userState[userId].step = 'addserver_quota';
        userState[userId].nama_server = nama_server;
        await ctx.reply('📊 *Silahkan masukkan quota server:*', { parse_mode: 'Markdown' });
        return;
    } else if (state && state.step === 'addserver_quota') {
        const quota = parseInt(ctx.message.text.trim(), 10);
        if (isNaN(quota)) {
            return ctx.reply('⚠️ *Quota tidak valid.* Silahkan masukkan quota server yang valid.', { parse_mode: 'Markdown' });
        }
        userState[userId].step = 'addserver_iplimit';
        userState[userId].quota = quota;
        await ctx.reply('🔢 *Silahkan masukkan limit IP server:*', { parse_mode: 'Markdown' });
        return;
    } else if (state && state.step === 'addserver_iplimit') {
        const iplimit = parseInt(ctx.message.text.trim(), 10);
        if (isNaN(iplimit)) {
            return ctx.reply('⚠️ *Limit IP tidak valid.* Silahkan masukkan limit IP server yang valid.', { parse_mode: 'Markdown' });
        }
        userState[userId].step = 'addserver_batas_create_akun';
        userState[userId].iplimit = iplimit;
        await ctx.reply('🔢 *Silahkan masukkan batas create akun server:*', { parse_mode: 'Markdown' });
        return;
    } else if (state && state.step === 'addserver_batas_create_akun') {
        const batas_create_akun = parseInt(ctx.message.text.trim(), 10);
        if (isNaN(batas_create_akun)) {
            return ctx.reply('⚠️ *Batas create akun tidak valid.* Silahkan masukkan batas create akun server yang valid.', { parse_mode: 'Markdown' });
        }
        userState[userId].step = 'addserver_harga';
        userState[userId].batas_create_akun = batas_create_akun;
        await ctx.reply('💰 *Silahkan masukkan harga server:*', { parse_mode: 'Markdown' });
        return;
    } else if (state && state.step === 'addserver_harga') {
        const harga = parseFloat(ctx.message.text.trim());
        if (isNaN(harga) || harga <= 0) {
            return ctx.reply('⚠️ *Harga tidak valid.* Silahkan masukkan harga server yang valid.', { parse_mode: 'Markdown' });
        }
        const { domain, auth, nama_server, quota, iplimit, batas_create_akun } = state;

        try {
            db.run('INSERT INTO Server (domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, total_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, 0], function(err) {
                    if (err) {
                        logger.error('Error saat menambahkan server:', err.message);
                        ctx.reply('❌ *Terjadi kesalahan saat menambahkan server baru.*', { parse_mode: 'Markdown' });
                    } else {
                        ctx.reply(`✅ *Server baru dengan domain ${domain} telah berhasil ditambahkan.*\n\n📄 *Detail Server:*\n- Domain: ${domain}\n- Auth: ${auth}\n- Nama Server: ${nama_server}\n- Quota: ${quota}\n- Limit IP: ${iplimit}\n- Batas Create Akun: ${batas_create_akun}\n- Harga: Rp ${harga}`, { parse_mode: 'Markdown' });
                    }
                });
        } catch (error) {
            logger.error('Error saat menambahkan server:', error);
            await ctx.reply('❌ *Terjadi kesalahan saat menambahkan server baru.*', { parse_mode: 'Markdown' });
        }
        delete userState[userId];
        return;
    }

    if (state && state.step === 'add_saldo') {
        const amountStr = ctx.message.text.trim();
        const amount = parseInt(amountStr, 10);

        if (isNaN(amount) || amount <= 0) {
            return ctx.reply('⚠️ *Jumlah saldo tidak valid. Masukkan angka positif.*', { parse_mode: 'Markdown' });
        }

        try {

            const targetUserId = state.userId;
            const changes = await new Promise((resolve, reject) => {
                db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, targetUserId], function(err) {
                    if (err) {
                        logger.error('⚠️ Kesalahan saat menambahkan saldo user:', err.message);
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                });
            });

            if (changes > 0) {
                ctx.reply(`✅ *Saldo sebesar \`${amount}\` berhasil ditambahkan ke user ID \`${targetUserId}\`.*`, { parse_mode: 'Markdown' });
            } else {
                ctx.reply('⚠️ *Pengguna tidak ditemukan atau saldo tidak berubah.*', { parse_mode: 'Markdown' });
            }
        } catch (err) {
            logger.error('❌ Terjadi kesalahan saat menambahkan saldo user:', err.message);
            ctx.reply('❌ *Terjadi kesalahan saat menambahkan saldo user.*', { parse_mode: 'Markdown' });
        }
        delete userState[userId];
        return;
    }

    const editSteps = ['edit_batas_create_akun', 'edit_limit_ip', 'edit_quota', 'edit_auth', 'edit_domain', 'edit_nama', 'edit_total_create_akun'];
    if (state && editSteps.includes(state.step)) {
        const newValue = ctx.message.text.trim();
        let query;
        let fieldName;
        let isNumeric = false;

        switch (state.step) {
            case 'edit_batas_create_akun':
                query = 'UPDATE Server SET batas_create_akun = ? WHERE id = ?';
                fieldName = 'batas create akun';
                isNumeric = true;
                break;
            case 'edit_limit_ip':
                query = 'UPDATE Server SET iplimit = ? WHERE id = ?';
                fieldName = 'limit IP';
                isNumeric = true;
                break;
            case 'edit_quota':
                query = 'UPDATE Server SET quota = ? WHERE id = ?';
                fieldName = 'quota';
                isNumeric = true;
                break;
            case 'edit_auth':
                query = 'UPDATE Server SET auth = ? WHERE id = ?';
                fieldName = 'auth';
                break;
            case 'edit_domain':
                query = 'UPDATE Server SET domain = ? WHERE id = ?';
                fieldName = 'domain';
                break;
            case 'edit_nama':
                query = 'UPDATE Server SET nama_server = ? WHERE id = ?';
                fieldName = 'nama server';
                break;
            case 'edit_total_create_akun':
                query = 'UPDATE Server SET total_create_akun = ? WHERE id = ?';
                fieldName = 'total create akun';
                isNumeric = true;
                break;
        }

        if (isNumeric && (isNaN(parseInt(newValue, 10)) || parseInt(newValue, 10) < 0)) {
            return ctx.reply(`⚠️ *${fieldName} tidak valid.* Masukkan angka positif yang valid.`, { parse_mode: 'Markdown' });
        }
        if (!newValue) {
            return ctx.reply(`⚠️ *${fieldName} tidak boleh kosong.*`, { parse_mode: 'Markdown' });
        }

        try {
            const valueToStore = isNumeric ? parseInt(newValue, 10) : newValue;
            const changes = await new Promise((resolve, reject) => {
                db.run(query, [valueToStore, state.serverId], function(err) {
                    if (err) {
                        logger.error(`⚠️ Kesalahan saat mengedit ${fieldName} server:`, err.message);
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                });
            });

            if (changes > 0) {
                ctx.reply(`✅ *${fieldName} server berhasil diubah menjadi \`${newValue}\`.*`, { parse_mode: 'Markdown' });
            } else {
                ctx.reply(`⚠️ *Server tidak ditemukan atau ${fieldName} tidak berubah.*`, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            logger.error(`❌ Error saat mengedit ${fieldName} server:`, error.message);
            ctx.reply(`❌ *Terjadi kesalahan saat mengedit ${fieldName} server.*`, { parse_mode: 'Markdown' });
        }
        delete userState[userId];
        return;
    }

    if (state && state.step === 'edit_harga') {
        const hargaStr = ctx.message.text.trim();
        const hargaBaru = parseFloat(hargaStr);

        if (isNaN(hargaBaru) || hargaBaru <= 0) {
            return ctx.reply('⚠️ *Harga tidak valid. Masukkan angka positif yang valid.*', { parse_mode: 'Markdown' });
        }

        try {
            const changes = await new Promise((resolve, reject) => {
                db.run('UPDATE Server SET harga = ? WHERE id = ?', [hargaBaru, state.serverId], function(err) {
                    if (err) {
                        logger.error('⚠️ Kesalahan saat mengedit harga server:', err.message);
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                });
            });

            if (changes > 0) {
                ctx.reply(`✅ *Harga server berhasil diubah menjadi \`Rp${hargaBaru}\`.*`, { parse_mode: 'Markdown' });
            } else {
                ctx.reply('⚠️ *Server tidak ditemukan atau harga tidak berubah.*', { parse_mode: 'Markdown' });
            }
        } catch (error) {
            logger.error('❌ Error saat mengedit harga server:', error.message);
            ctx.reply('❌ *Terjadi kesalahan saat mengedit harga server.*', { parse_mode: 'Markdown' });
        }
        delete userState[userId];
        return;
    }
});


bot.action('addserver', async (ctx) => {
  try {
    logger.info('📥 Proses tambah server dimulai');
    await ctx.answerCbQuery();
    await ctx.reply('🌐 *Silahkan masukkan domain/ip server:*', { parse_mode: 'Markdown' });
    userState[ctx.chat.id] = { step: 'addserver' };
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses tambah server:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});
bot.action('detailserver', async (ctx) => {
  try {
    logger.info('📋 Proses detail server dimulai');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('⚠️ Kesalahan saat mengambil detail server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil detail server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      logger.info('⚠️ Tidak ada server yang tersedia');
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

    await ctx.reply('📋 *Silahkan pilih server untuk melihat detail:*', {
      reply_markup: { inline_keyboard: buttons },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('⚠️ Kesalahan saat mengambil detail server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
  }
});

bot.action('listserver', async (ctx) => {
  try {
    logger.info('📜 Proses daftar server dimulai');
    await ctx.answerCbQuery();

    // Ambil role user dan diskon reseller
    const userId = ctx.from.id;
    const userRole = await new Promise((resolve, reject) => {
        db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.role : 'member');
        });
    });

    let resellerDiscount = 0;
    if (userRole === 'reseller') {
        resellerDiscount = await new Promise((resolve, reject) => {
            db.get('SELECT discount_percent FROM reseller_config WHERE id = 1', (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.discount_percent : 0);
            });
        });
    }
    // End of reseller discount fetch

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('⚠️ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      logger.info('⚠️ Tidak ada server yang tersedia');
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
    }

    let serverList = '📜 *Daftar Server* 📜\n\n';
    servers.forEach((server, index) => {
      let hargaPerHariTampilan = server.harga;
      // Terapkan diskon untuk tampilan jika user adalah reseller
      if (userRole === 'reseller' && resellerDiscount > 0) {
          hargaPerHariTampilan = Math.floor(server.harga * (100 - resellerDiscount) / 100);
      }
      const hargaPer30HariTampilan = hargaPerHariTampilan * 30;

      serverList += `━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `🌏 *${server.nama_server}*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `🏷️ Harga per hari: Rp${hargaPerHariTampilan}\n` + // Menggunakan harga yang disesuaikan
                    `📅 Harga per 30 hari: Rp${hargaPer30HariTampilan}\n` + // Menggunakan harga yang disesuaikan
                    `🌤 Quota: ${server.quota}GB\n` +
                    `🚀 Limit IP: ${server.iplimit} IP\n` +
                    `👥 Total Create Akun: ${server.total_create_akun}/${server.batas_create_akun}\n\n`;
    });

    serverList += `\nTotal Jumlah Server: ${servers.length}`;

    await ctx.reply(serverList, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('⚠️ Kesalahan saat mengambil daftar server:', error);
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
    logger.error('❌ Error saat memulai proses reset database:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('confirm_resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM Server', (err) => {
        if (err) {
          logger.error('❌ Error saat mereset tabel Server:', err.message);
          return reject('❗️ *PERHATIAN! Terjadi KESALAHAN SERIUS saat mereset database. Harap segera hubungi administrator!*');
        }
        resolve();
      });
    });
    await ctx.reply('🚨 *PERHATIAN! Database telah DIRESET SEPENUHNYA. Semua server telah DIHAPUS TOTAL.*', { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('❌ Error saat mereset database:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('cancel_resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('❌ *Proses reset database dibatalkan.*', { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('❌ Error saat membatalkan reset database:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('deleteserver', async (ctx) => {
  try {
    logger.info('🗑️ Proses hapus server dimulai');
    await ctx.answerCbQuery();

    db.all('SELECT * FROM Server', [], (err, servers) => {
      if (err) {
        logger.error('⚠️ Kesalahan saat mengambil daftar server:', err.message);
        return ctx.reply('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*', { parse_mode: 'Markdown' });
      }

      if (servers.length === 0) {
        logger.info('⚠️ Tidak ada server yang tersedia');
        return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
      }

      const keyboard = servers.map(server => {
        return [{ text: server.nama_server, callback_data: `confirm_delete_server_${server.id}` }];
      });
      keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'kembali_ke_menu' }]);

      ctx.reply('🗑️ *Pilih server yang ingin dihapus:*', {
        reply_markup: {
          inline_keyboard: keyboard
        },
        parse_mode: 'Markdown'
      });
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses hapus server:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});

bot.action('cek_saldo', async (ctx) => {
  try {
    const userId = ctx.from.id;

    const row = await new Promise((resolve, reject) => {
      db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
          logger.error('❌ Kesalahan saat memeriksa saldo:', err.message);
          return reject('❌ *Terjadi kesalahan saat memeriksa saldo Anda. Silahkan coba lagi nanti.*');
        }
        resolve(row);
      });
    });

    if (row) {
      await ctx.reply(`📊 *Cek Saldo*\n\n🆔 ID Telegram: ${userId}\n💰 Sisa Saldo: Rp${row.saldo}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💸 Top Up', callback_data: 'menu_topup' }, { text: '📝 Menu Utama', callback_data: 'send_main_menu' }]
          ]
        }
      });
    } else {
      await ctx.reply('⚠️ *Anda belum memiliki saldo. Silahkan tambahkan saldo terlebih dahulu.*', { parse_mode: 'Markdown' });
    }

  } catch (error) {
    logger.error('❌ Kesalahan saat memeriksa saldo:', error);
    await ctx.reply(`❌ *${error.message}*`, { parse_mode: 'Markdown' });
  }
});

const getUsernameById = async (userId) => {
  try {
    const telegramUser = await bot.telegram.getChat(userId);
    // Menggunakan template literal untuk mengembalikan '@username' jika ada, atau nama depan
    if (telegramUser.username) {
      return `${telegramUser.username}`;
    } else if (telegramUser.first_name) {
      return telegramUser.first_name;
    } else {
      // Jika tidak ada username maupun nama depan, kembalikan string default
      return 'N/A';
    }
  } catch (err) {
    logger.error(`❌ Kesalahan saat mengambil username dari Telegram untuk ID ${userId}:`, err.message);
    // Kembalikan nilai yang aman (non-error) saat terjadi kesalahan,
    // agar program tidak berhenti.
    return 'N/A';
  }
};

bot.action('addsaldo_user', async (ctx) => {
  try {
    logger.info('Add saldo user process started');
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all('SELECT id, user_id FROM Users LIMIT 20', [], (err, users) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM Users', [], (err, row) => {
        if (err) {
          logger.error('❌ Kesalahan saat menghitung total user:', err.message);
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

    await ctx.reply('📊 *Silahkan pilih user untuk menambahkan saldo:*', {
      reply_markup: replyMarkup,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses tambah saldo user:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action(/next_users_(\d+)/, async (ctx) => {
  const currentPage = parseInt(ctx.match[1]);
  const offset = currentPage * 20;

  try {
    logger.info(`Next users process started for page ${currentPage + 1}`);
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all(`SELECT id, user_id FROM Users LIMIT 20 OFFSET ${offset}`, [], (err, users) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM Users', [], (err, row) => {
        if (err) {
          logger.error('❌ Kesalahan saat menghitung total user:', err.message);
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
    logger.error('❌ Kesalahan saat memproses next users:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action(/prev_users_(\d+)/, async (ctx) => {
  const currentPage = parseInt(ctx.match[1]);
  const offset = (currentPage - 1) * 20;

  try {
    logger.info(`Previous users process started for page ${currentPage}`);
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all(`SELECT id, user_id FROM Users LIMIT 20 OFFSET ${offset}`, [], (err, users) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM Users', [], (err, row) => {
        if (err) {
          logger.error('❌ Kesalahan saat menghitung total user:', err.message);
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
    logger.error('❌ Kesalahan saat memproses previous users:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_limit_ip', async (ctx) => {
  try {
    logger.info('Edit server limit IP process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
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

    await ctx.reply('📊 *Silahkan pilih server untuk mengedit limit IP:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit limit IP server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_batas_create_akun', async (ctx) => {
  try {
    logger.info('Edit server batas create akun process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
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

    await ctx.reply('📊 *Silahkan pilih server untuk mengedit batas create akun:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit batas create akun server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_total_create_akun', async (ctx) => {
  try {
    logger.info('Edit server total create akun process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
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

    await ctx.reply('📊 *Silahkan pilih server untuk mengedit total create akun:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit total create akun server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_quota', async (ctx) => {
  try {
    logger.info('Edit server quota process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
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

    await ctx.reply('📊 *Silahkan pilih server untuk mengedit quota:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit quota server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_auth', async (ctx) => {
  try {
    logger.info('Edit server auth process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
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

    await ctx.reply('🌐 *Silahkan pilih server untuk mengedit auth:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit auth server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_harga', async (ctx) => {
  try {
    logger.info('Edit server harga process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
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

    await ctx.reply('💰 *Silahkan pilih server untuk mengedit harga:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit harga server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_domain', async (ctx) => {
  try {
    logger.info('Edit server domain process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
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

    await ctx.reply('🌐 *Silahkan pilih server untuk mengedit domain:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit domain server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('nama_server_edit', async (ctx) => {
  try {
    logger.info('Edit server nama process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
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

    await ctx.reply('🏷️ *Silahkan pilih server untuk mengedit nama:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit nama server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('topup_saldo', async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  try {
    await ctx.answerCbQuery();
    logger.info(`🔍 User ${userId} memulai proses top-up saldo (QRIS Orkut).`);

    if (lastMenus[userId]) {
      try {
        await bot.telegram.deleteMessage(chatId, lastMenus[userId]);
        logger.info(`🧹 Menu lama milik ${userId} berhasil dihapus`);
        delete lastMenus[userId];
      } catch (e) {
        console.warn(`⚠️ Gagal menghapus menu sebelumnya untuk ${userId}:`, e.message);
      }
    }

    // ✅ Simpan state bahwa user diminta masukkan nominal untuk QRIS Orkut
    if (!global.depositState) global.depositState = {};
    global.depositState[userId] = { action: 'request_amount_orkut', amount: '' }; // Perubahan di sini

    logger.info(`📝 Menunggu input nominal dari user ${userId} untuk QRIS Orkut`);

    // Kirim instruksi ke user untuk mengetik nominal
    const sent = await ctx.reply(
  `
💳━━━━━━━━━━━━━━━━━━━━💳
        *Qʀɪꜱ Oʀᴋᴜᴛ ᴛᴏᴘ-ᴜᴘ*
💳━━━━━━━━━━━━━━━━━━━━💳

⚡ *ꜱɪʟᴀʜᴋᴀɴ ᴋᴇᴛɪᴋ ɴᴏᴍɪɴᴀʟ ᴛᴏᴘ-ᴜᴘ*  
ʏᴀɴɢ ɪɴɢɪɴ ᴀɴᴅᴀ ʙᴀʏᴀʀᴋᴀɴ ᴍᴇʟᴀʟᴜɪ ᴍᴇᴛᴏᴅᴇ Qʀɪꜱ Oʀᴋᴜᴛ.  

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

    // Simpan ID pesan agar bisa dihapus nantinya
    if (sent && sent.message_id) {
      lastMenus[userId] = sent.message_id;
    }

  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses top-up saldo (QRIS Orkut):', error);
    try {
      await ctx.reply(
        '❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.*',
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      logger.error('Gagal kirim pesan error:', e.message);
    }
  }
});



bot.action('bonus_topup_setting', async (ctx) => {
    await ctx.answerCbQuery();
    db.get('SELECT * FROM bonus_config WHERE id = 1', (err, row) => {
        if (err || !row) {
            return ctx.reply('❌ Gagal mengambil pengaturan bonus.');
        }

        ctx.reply(`⚙️ *Pengaturan Bonus Top Up*

` +
            `Status: *${row.enabled ? 'Aktif ✅' : 'Nonaktif ❌'}*
` +
            `Minimal TopUp: *Rp${row.min_topup}*
` +
            `Bonus: *${row.bonus_percent}%*

` +
            `Klik tombol di bawah ini untuk mengatur:`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔧 Atur Bonus TopUp', callback_data: 'atur_bonus_topup' }]
                ]
            }
        });
    });
});


bot.action('atur_bonus_topup', async (ctx) => {
    await ctx.answerCbQuery();

    userState[ctx.chat.id] = { step: 'atur_bonus_input' };
    await ctx.reply('✍️ Kirim format:\n`on|off <minimal_topup> <persen_bonus>`\n\nContoh:\n`on 10000 25`', {
        parse_mode: 'Markdown'
    });
});

bot.action('log_bonus_topup', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;

  db.all('SELECT * FROM bonus_log ORDER BY id DESC LIMIT 10', [], (err, rows) => {
    if (err || rows.length === 0) {
      return ctx.reply('⚠️ Belum ada data bonus');
    }

    let isi = rows.map((row, i) => {
      const username = row.username ? `\`${row.username}\`` : `\`${row.user_id}\``;
      const formattedTimestamp = new Date(row.timestamp).toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      return `━━━━━━━━━━━━━━\n🔹 *${i + 1}*\n👤 User: ${username}\n🆔 ID: \`${row.user_id}\`\n💰 TopUp: *Rp${row.amount}*\n🎁 Bonus: *Rp${row.bonus}*\n⏰ ${formattedTimestamp}`;
    }).join('\n\n');

    // Tambahin garis terakhir di paling bawah
    isi += `\n━━━━━━━━━━━━━━`;

    ctx.reply(`✨ *Riwayat Bonus Top Up*\n_10 Data Terbaru_\n\n${isi}`, {
      parse_mode: 'Markdown'
    });
  });
});

bot.action('log_topup', async (ctx) => {
  await ctx.answerCbQuery();

  db.all('SELECT * FROM topup_log ORDER BY id DESC LIMIT 10', [], (err, rows) => {
    if (err || rows.length === 0) {
      return ctx.reply('⚠️ Belum ada data topup');
    }

    let isi = rows.map((row, i) => {
      const username = row.username ? `\`${row.username}\`` : `\`${row.user_id}\``;
      const formattedTimestamp = new Date(row.waktu).toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      return `━━━━━━━━━━━━━━\n🔹 *${i + 1}*\n👤 User: ${username}\n🆔 ID: \`${row.user_id}\`\n💰 TopUp: *Rp${row.amount}*\n⏰ ${formattedTimestamp}`;
    }).join('\n\n');

    // Tambahin garis terakhir di paling bawah
    isi += `\n━━━━━━━━━━━━━━`;

    ctx.reply(`💳 *Riwayat Top Up*\n_10 Data Terbaru_\n\n${isi}`, {
      parse_mode: 'Markdown'
    });
  });
});


function prosesBonusTopUp(user_id, username, original_amount) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM bonus_config WHERE id = 1', (err, config) => {
      if (err || !config) return resolve(); // lanjut aja walaupun gagal

      if (config.enabled && original_amount >= config.min_topup) {
        const bonus = Math.floor(original_amount * config.bonus_percent / 100);

        db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [bonus, user_id], (err2) => {
          if (err2) return resolve(); // tetap resolve supaya lanjut

          db.run('INSERT INTO bonus_log (user_id, username, amount, bonus, timestamp) VALUES (?, ?, ?, ?, ?)', [
            user_id,
            username || '',
            original_amount,
            bonus,
            new Date().toISOString()
          ], () => {
            // Kirim pesan setelah log bonus
            bot.telegram.sendMessage(user_id, `🎁 *Bonus Top Up!* Kamu dapat saldo tambahan *Rp${bonus}* (${config.bonus_percent}%)`, {
              parse_mode: 'Markdown'
            });
            resolve();
          });
        });
      } else {
        resolve();
      }
    });
  });
}

function logTopup(user_id, username, amount, method) {
  db.run(
    'INSERT INTO topup_log (user_id, username, amount, method, waktu) VALUES (?, ?, ?, ?, ?)',
    [
      user_id,
      username || '',
      amount,
      method,
      new Date().toISOString()
    ],
    (err) => {
      if (err) {
        logger.error('❌ Gagal insert ke topup_log:', err.message);
      } else {
        logger.info(`✅ Log Topup: ${user_id} - ${username} - Rp${amount} - ${method}`);
      }
    }
  );
}

bot.action(/edit_harga_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit harga server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_harga', serverId: serverId };

  await ctx.reply('💰 *Silahkan masukkan harga server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/add_saldo_(\d+)/, async (ctx) => {
  const userId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk menambahkan saldo user dengan ID: ${userId}`);
  userState[ctx.chat.id] = { step: 'add_saldo', userId: userId };

  await ctx.reply('📊 *Silahkan masukkan jumlah saldo yang ingin ditambahkan:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_batas_create_akun_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit batas create akun server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_batas_create_akun', serverId: serverId };

  await ctx.reply('📊 *Silahkan masukkan batas create akun server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_total_create_akun_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit total create akun server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_total_create_akun', serverId: serverId };

  await ctx.reply('📊 *Silahkan masukkan total create akun server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_limit_ip_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit limit IP server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_limit_ip', serverId: serverId };

  await ctx.reply('📊 *Silahkan masukkan limit IP server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_quota_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit quota server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_quota', serverId: serverId };

  await ctx.reply('📊 *Silahkan masukkan quota server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_auth_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit auth server dengan ID: ${serverId}`);

  userState[ctx.chat.id] = {
    step: 'edit_auth',
    serverId: serverId
  };

  await ctx.reply('✏️ *Silahkan kirim auth server baru sekarang:*', {
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_domain_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit domain server dengan ID: ${serverId}`);

  userState[ctx.chat.id] = {
    step: 'edit_domain',
    serverId: serverId
  };

  await ctx.reply('🌐 *Silahkan kirim domain server baru sekarang:*', {
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_nama_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit nama server dengan ID: ${serverId}`);

  userState[ctx.chat.id] = {
    step: 'edit_nama',
    serverId: serverId
  };

  await ctx.reply('🏷️ *Silahkan kirim nama server baru sekarang:*', {
    parse_mode: 'Markdown'
  });
});
bot.action(/confirm_delete_server_(\d+)/, async (ctx) => {
  try {
    db.run('DELETE FROM Server WHERE id = ?', [ctx.match[1]], function(err) {
      if (err) {
        logger.error('Error deleting server:', err.message);
        return ctx.reply('⚠️ *PERHATIAN! Terjadi kesalahan saat menghapus server.*', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
        logger.info('Server tidak ditemukan');
        return ctx.reply('⚠️ *PERHATIAN! Server tidak ditemukan.*', { parse_mode: 'Markdown' });
      }

      logger.info(`Server dengan ID ${ctx.match[1]} berhasil dihapus`);
      ctx.reply('✅ *Server berhasil dihapus.*', { parse_mode: 'Markdown' });
    });
  } catch (error) {
    logger.error('Kesalahan saat menghapus server:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});
bot.action(/server_detail_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  try {
    const server = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
        if (err) {
          logger.error('⚠️ Kesalahan saat mengambil detail server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil detail server.*');
        }
        resolve(server);
      });
    });

    if (!server) {
      logger.info('⚠️ Server tidak ditemukan');
      return ctx.reply('⚠️ *PERHATIAN! Server tidak ditemukan.*', { parse_mode: 'Markdown' });
    }

    const serverDetails = `📋 *Detail Server* 📋\n\n` +
      `🌏 *Domain:* \`${server.domain}\`\n` +
      `🔑 *Auth:* \`${server.auth}\`\n` +
      `🏷️ *Nama Server:* \`${server.nama_server}\`\n` +
      `🌤 *Quota:* \`${server.quota}\`\n` +
      `🚀 *Limit IP:* \`${server.iplimit}\`\n` +
      `🔢 *Batas Create Akun:* \`${server.batas_create_akun}\`\n` +
      `📋 *Total Create Akun:* \`${server.total_create_akun}\`\n` +
      `💵 *Harga:* \`Rp ${server.harga}\`\n\n`;

    await ctx.reply(serverDetails, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('⚠️ Kesalahan saat mengambil detail server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
  }
});

bot.on('callback_query', async (ctx) => {
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;
  const userStateData = userState[ctx.chat.id];

  await ctx.answerCbQuery();

  console.log("Callback diterima:", data);


  // ===============================
  // 📋 LIST SALDO
  // ===============================
  if (data.startsWith('listsaldo_')) {
    const page = parseInt(data.split('_')[1], 10);
    await sendPaginatedUserSaldo(ctx, page, true);
    return;
  }

  // ===============================
  // 💼 LIST RESELLER
  // ===============================
  if (data.startsWith('listreseller_')) {
    const parts = data.split('_');
    const direction = parts[1];
    let page = parseInt(parts[2]);
    page = direction === 'next' ? page + 1 : page - 1;
    if (page < 1) page = 1;
    await sendPaginatedResellerList(ctx, page, ctx.callbackQuery.message.message_id);
    return;
  }

  // ===============================
  // 🧪 LIST UNLIMITED TRIAL
  // ===============================
  if (data.startsWith('listunlimitedtrial_')) {
    const parts = data.split('_');
    const direction = parts[1];
    let page = parseInt(parts[2]);
    page = direction === 'next' ? page + 1 : page - 1;
    if (page < 1) page = 1;
    await showUnlimitedTrialPage(ctx, page, ctx.callbackQuery.message.message_id);
    return;
  }

  // ===============================
  // ⚙️ HANDLER STATE USER
  // ===============================
  if (userStateData) {
    const isNumericInput = !isNaN(parseInt(data, 10)) || data === 'delete' || data === 'confirm';
    const isAlphaNumericInput = /^[a-zA-Z0-9.-]+$/.test(data) || data === 'delete' || data === 'confirm';

    if (
      global.depositState?.[userId] &&
      global.depositState[userId].action === 'request_amount' &&
      isNumericInput
    ) {
      await handleDepositState(ctx, userId, data);
    } else {
      switch (userStateData.step) {
        case 'add_saldo':
          if (isNumericInput) await handleAddSaldo(ctx, userStateData, data);
          break;
        case 'edit_batas_create_akun':
          if (isNumericInput) await handleEditBatasCreateAkun(ctx, userStateData, data);
          break;
        case 'edit_limit_ip':
          if (isNumericInput) await handleEditiplimit(ctx, userStateData, data);
          break;
        case 'edit_quota':
          if (isNumericInput) await handleEditQuota(ctx, userStateData, data);
          break;
        case 'edit_auth':
          if (isAlphaNumericInput) await handleEditAuth(ctx, userStateData, data);
          break;
        case 'edit_domain':
          if (isAlphaNumericInput) await handleEditDomain(ctx, userStateData, data);
          break;
        case 'edit_harga':
          if (isNumericInput) await handleEditHarga(ctx, userStateData, data);
          break;
        case 'edit_nama':
          if (isAlphaNumericInput) await handleEditNama(ctx, userStateData, data);
          break;
        case 'edit_total_create_akun':
          if (isNumericInput) await handleEditTotalCreateAkun(ctx, userStateData, data);
          break;
        default:
          logger.warn(`Unhandled callback_query: ${data} for userState.step: ${userStateData.step}`);
          break;
      }
    }
  }
});



async function handleDepositState(ctx, userId, data) {
  let state = global.depositState[userId];
  if (!state) return;

  let currentAmount = state.amount || '';
  const action = state.action;

  if (data === 'delete') {
    currentAmount = currentAmount.slice(0, -1);
  } else if (data === 'confirm') {
    if (!currentAmount || currentAmount.length === 0) {
      return await ctx.answerCbQuery('⚠️ Jumlah tidak boleh kosong!', { show_alert: true });
    }

    if (parseInt(currentAmount) < 100) {
      return await ctx.answerCbQuery('⚠️ Jumlah minimal top-up adalah 100 Ya Kak...!!!', { show_alert: true });
    }

    // Hapus pesan input nominal
    try {
      await ctx.deleteMessage();
    } catch (e) {
      logger.warn(`⚠️ Gagal menghapus pesan top-up konfirmasi: ${e.message}`);
    }

    global.depositState[userId].action = 'confirm_amount';
    await processDeposit(ctx, currentAmount);

    // Hapus state
    delete global.depositState[userId];
    return;
  } else {
    if (currentAmount.length < 12) {
      currentAmount += data;
    } else {
      return await ctx.answerCbQuery(`⚠️ Jumlah maksimal adalah 12 digit!`, { show_alert: true });
    }
  }

  global.depositState[userId].amount = currentAmount;

  const newMessage = `💳 Topup Saldo Otomatis QRIS\n━━━━━━━━━━━━━━━━━━━━━━\nMasukkan nominal topup:\n\nRp ${currentAmount}\n\nMinimal topup Rp 100\n━━━━━━━━━━━━━━━━━━━━━━\nGunakan tombol di bawah untuk input nominal.`;

  try {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    if (error.description && error.description.includes('message is not modified')) {
      return;
    }
    logger.error('❌ Gagal update pesan nominal top-up:', error);
  }
}



async function handleAddSaldo(ctx, userStateData, data) {
  let currentSaldo = userStateData.saldo || '';

  if (data === 'delete') {
    currentSaldo = currentSaldo.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentSaldo.length === 0) {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo tidak boleh kosong!*', { show_alert: true });
    }

    try {
      await updateUserSaldo(userStateData.userId, currentSaldo);
      ctx.reply(`✅ *Saldo user berhasil ditambahkan.*\n\n📄 *Detail Saldo:*\n- Jumlah Saldo: *Rp ${currentSaldo}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply('❌ *Terjadi kesalahan saat menambahkan saldo user.*', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^[0-9]+$/.test(data)) {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo tidak valid!*', { show_alert: true });
    }
    if (currentSaldo.length < 10) {
      currentSaldo += data;
    } else {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo maksimal adalah 10 karakter!*', { show_alert: true });
    }
  }

  userStateData.saldo = currentSaldo;
  const newMessage = `📊 *Silahkan masukkan jumlah saldo yang ingin ditambahkan:*\n\nJumlah saldo saat ini: *${currentSaldo}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  }
}

async function handleEditBatasCreateAkun(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'batasCreateAkun', 'batas create akun', 'UPDATE Server SET batas_create_akun = ? WHERE id = ?');
}

async function handleEditTotalCreateAkun(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'totalCreateAkun', 'total create akun', 'UPDATE Server SET total_create_akun = ? WHERE id = ?');
}

async function handleEditiplimit(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'iplimit', 'limit IP', 'UPDATE Server SET iplimit = ? WHERE id = ?');
}

async function handleEditQuota(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'quota', 'quota', 'UPDATE Server SET quota = ? WHERE id = ?');
}

async function handleEditAuth(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'auth', 'auth', 'UPDATE Server SET auth = ? WHERE id = ?');
}

async function handleEditDomain(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'domain', 'domain', 'UPDATE Server SET domain = ? WHERE id = ?');
}

async function handleEditHarga(ctx, userStateData, data) {
  let currentAmount = userStateData.amount || '';

  if (data === 'delete') {
    currentAmount = currentAmount.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentAmount.length === 0) {
      return await ctx.answerCbQuery('⚠️ *Jumlah tidak boleh kosong!*', { show_alert: true });
    }
    const hargaBaru = parseFloat(currentAmount);
    if (isNaN(hargaBaru) || hargaBaru <= 0) {
      return ctx.reply('❌ *Harga tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
    }
    try {
      await updateServerField(userStateData.serverId, hargaBaru, 'UPDATE Server SET harga = ? WHERE id = ?');
      ctx.reply(`✅ *Harga server berhasil diupdate.*\n\n📄 *Detail Server:*\n- Harga Baru: *Rp ${hargaBaru}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply('❌ *Terjadi kesalahan saat mengupdate harga server.*', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^\d+$/.test(data)) {
      return await ctx.answerCbQuery('⚠️ *Hanya angka yang diperbolehkan!*', { show_alert: true });
    }
    if (currentAmount.length < 12) {
      currentAmount += data;
    } else {
      return await ctx.answerCbQuery('⚠️ *Jumlah maksimal adalah 12 digit!*', { show_alert: true });
    }
  }

  userStateData.amount = currentAmount;
  const newMessage = `💰 *Silahkan masukkan harga server baru:*\n\nJumlah saat ini: *Rp ${currentAmount}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  }
}

async function handleEditNama(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'name', 'nama server', 'UPDATE Server SET nama_server = ? WHERE id = ?');
}

async function handleEditField(ctx, userStateData, data, field, fieldName, query) {
  let currentValue = userStateData[field] || '';

  if (data === 'delete') {
    currentValue = currentValue.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentValue.length === 0) {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} tidak boleh kosong!*`, { show_alert: true });
    }
    try {
      await updateServerField(userStateData.serverId, currentValue, query);
      ctx.reply(`✅ *${fieldName} server berhasil diupdate.*\n\n📄 *Detail Server:*\n- ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}: *${currentValue}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply(`❌ *Terjadi kesalahan saat mengupdate ${fieldName} server.*`, { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^[a-zA-Z0-9.-]+$/.test(data)) {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} tidak valid!*`, { show_alert: true });
    }
    if (currentValue.length < 253) {
      currentValue += data;
    } else {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} maksimal adalah 253 karakter!*`, { show_alert: true });
    }
  }

  userStateData[field] = currentValue;
  const newMessage = `📊 *Silahkan masukkan ${fieldName} server baru:*\n\n${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} saat ini: *${currentValue}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  }
}
async function updateUserSaldo(userId, saldo) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE Users SET saldo = saldo + ? WHERE id = ?', [saldo, userId], function (err) {
      if (err) {
        logger.error('⚠️ Kesalahan saat menambahkan saldo user:', err.message);
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
        logger.error(`⚠️ Kesalahan saat mengupdate server field:`, err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}


global.depositState = {};
global.pendingDeposits = {};
let lastRequestTime = 0;
const requestInterval = 1000;

db.all('SELECT * FROM pending_deposits WHERE status = "pending"', [], (err, rows) => {
  if (err) {
    logger.error('Gagal load pending_deposits:', err.message);
    return;
  }
  rows.forEach(row => {
    global.pendingDeposits[row.unique_code] = {
      amount: row.amount,
      originalAmount: row.original_amount,
      userId: row.user_id,
      username: row.username,
      timestamp: row.timestamp,
      status: row.status,
      qrMessageId: row.qr_message_id
    };
  });
  logger.info('Pending deposit loaded:', Object.keys(global.pendingDeposits).length);
});

async function processDeposit(ctx, amount) {
  const currentTime = Date.now();
  const userId = ctx.from.id;

  // Anti-spam request
  if (global.depositState?.[userId]) {
    return ctx.reply("⚠️ Kamu masih punya transaksi deposit yang belum selesai!");
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
      console.error("Gagal reset deposit:", e);
    }
  }

  let waitMsg;
  const start = Date.now();

  try {
    waitMsg = await ctx.reply("⏳ Mohon menunggu...");
    let dots = 0;
    const loading = setInterval(async () => {
      dots = (dots + 1) % 4;
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id, waitMsg.message_id, null,
          "⏳ Mohon menunggu" + ".".repeat(dots)
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
      console.error("Gagal request deposit API:", err.message);
      await resetDepositState();
      try { await ctx.deleteMessage(waitMsg.message_id); } catch {}
      return ctx.reply("❌ Gagal membuat QRIS. Silakan coba lagi nanti.");
    }

    const { total_amount, qris_url, transaction_id, expired_minutes, fee } = depositResp;

    // === Download gambar QRIS dari URL ===
    let qrBuffer;
    try {
      const imgRes = await axios.get(qris_url, { responseType: 'arraybuffer' });
      qrBuffer = Buffer.from(imgRes.data);
    } catch (err) {
      clearInterval(loading);
      console.error("Gagal download gambar QRIS:", err.message);
      await resetDepositState();
      try { await ctx.deleteMessage(waitMsg.message_id); } catch {}
      return ctx.reply("❌ Gagal memuat gambar QRIS. Silakan coba lagi nanti.");
    }

    clearInterval(loading);

    // === Kirim QR ke user ===
    const caption =
      `📝 *Detail Pembayaran:*\n\n` +
      `💰 Jumlah: Rp ${total_amount.toLocaleString('id-ID')}\n` +
      `- Nominal Top Up: Rp ${amountInt.toLocaleString('id-ID')}\n` +
      `- Admin Fee : Rp ${(fee || 0).toLocaleString('id-ID')}\n` +
      `⚠️ *Penting:* Mohon transfer sesuai nominal\n` +
      `⏱️ Waktu: ${expired_minutes || 5} menit\n\n` +
      `⚠️ *Catatan:*\n` +
      `- Pembayaran akan otomatis terverifikasi\n` +
      `- Jangan tutup halaman ini\n` +
      `- Jika pembayaran berhasil, saldo akan otomatis ditambahkan`;

    const inlineKeyboard = [
      [{ text: "📢 Join Channel", url: `https://t.me/${GROUP_USERNAME}` }],
      [{ text: "❌ Batal Topup", callback_data: `batal_topup_${uniqueCode}` }]
    ];

    const qrMessage = await ctx.replyWithPhoto(
      { source: qrBuffer },
      { caption, parse_mode: "Markdown", reply_markup: { inline_keyboard: inlineKeyboard } }
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
    console.error("❌ Kesalahan saat memproses deposit:", error);
    await resetDepositState();
    await ctx.reply(
      '❌ *GAGAL!* Terjadi kesalahan saat memproses pembayaran. Silahkan coba lagi nanti.',
      { parse_mode: 'Markdown' }
    );
  }
}


function insertPendingDeposit(uniqueCode, userId, username, finalAmount, originalAmount, qrMessageId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO pending_deposits (unique_code, user_id, username, amount, original_amount, timestamp, status, qr_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uniqueCode, userId, username, finalAmount, originalAmount, Date.now(), 'pending', qrMessageId],
      (err) => {
        if (err) {
          logger.error('Gagal insert pending_deposits:', err.message);
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
        logger.error('Gagal hapus pending_deposits (error):', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function checkQRISStatus() {
  try {
    const pendingDeposits = Object.entries(global.pendingDeposits);
    for (const [uniqueCode, deposit] of pendingDeposits) {
      if (deposit.status !== 'pending') continue;

      const depositAge = Date.now() - deposit.timestamp;
      // Periksa kedaluwarsa secara lokal (5 menit)
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
          logger.error('Error saat menghapus pesan pembayaran kedaluwarsa:', error);
        } finally {
          delete global.pendingDeposits[uniqueCode];
          db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
            if (err) logger.error('Gagal menghapus pending_deposits (kedaluwarsa):', err.message);
          });
        }
        continue;
      }

      // Skip jika tidak ada transaction_id (deposit lama sebelum migrasi)
      if (!deposit.transactionId) continue;

      try {
        // === Cek status pembayaran ke API VPNNexus ===
        const checkUrl = `${PAYMENT_BASE_URL}/status/payment?transaction_id=${deposit.transactionId}&apikey=${PAYMENT_APIKEY}`;
        const result = await axios.get(checkUrl);

        if (result.data.status === 'success' && result.data.paid === true) {
          const transactionKey = `${deposit.transactionId}_${deposit.amount}`;
          if (global.processedTransactions.has(transactionKey)) {
            logger.info(`Transaksi ${transactionKey} sudah diproses, melewati...`);
            continue;
          }

          // Proses pembayaran yang sudah lunas
          const success = await processMatchingPayment(deposit, { transaction_id: deposit.transactionId, amount: deposit.amount }, uniqueCode);
          if (success) {
            logger.info(`Pembayaran berhasil diproses untuk ${uniqueCode}`);
            delete global.pendingDeposits[uniqueCode];
            db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
              if (err) logger.error('Gagal menghapus pending_deposits (berhasil):', err.message);
            });
          }
        }
      } catch (error) {
        logger.error(`Error saat memeriksa status pembayaran untuk ${uniqueCode}:`, error.message);
      }
    }
  } catch (error) {
    logger.error('Error di checkQRISStatus:', error);
  }
}

function keyboard_abc() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({
      text: char,
      callback_data: char
    }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
}

function keyboard_nomor() {
  const alphabet = '1234567890';
  const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({
      text: char,
      callback_data: char
    }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
}

function keyboard_full() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({
      text: char,
      callback_data: char
    }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
}

global.processedTransactions = new Set();
async function updateUserBalance(userId, amount) {
    return new Promise((resolve, reject) => {
        db.run("UPDATE users SET saldo = saldo + ? WHERE user_id = ?",
            [amount, userId],
            function(err) {
                if (err) {
                    logger.error('Kesalahan saat mengupdate saldo pengguna:', err.message);
                    reject(err);
                    return;
                }
                resolve(this.changes);
            }
        );
    });
}

async function getUserBalance(userId) {
  return new Promise((resolve, reject) => {
    db.get("SELECT saldo FROM users WHERE user_id = ?", [userId],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      }
    );
  });
}

function getBotGroupData() {
  try {
    if (!groupId || !BOT_TOKEN) {
      logger.warn('❌ Konfigurasi grup tidak lengkap di .vars.json (GROUP_CHAT_ID atau BOT_TOKEN kosong). Notifikasi grup mungkin tidak berfungsi.');
      return null;
    }

    return { keyGroup: BOT_TOKEN, chatId: groupId };

  } catch (err) {
    logger.error('❌ Terjadi kesalahan saat mendapatkan data grup:', err.message);
    return null;
  }
}

async function getIspNameFromExternalSource(domainOrIp) {
  if (!domainOrIp || domainOrIp === '-') {
    return 'N/A'; // Jika domain/IP tidak valid, kembalikan N/A
  }
  try {
    // Menggunakan ip-api.com untuk lookup ISP
    const response = await axios.get(`http://ip-api.com/json/${domainOrIp}?fields=isp`);
    if (response.data && response.data.isp) {
      return response.data.isp;
    }
    return 'Unknown ISP';
  } catch (error) {
    logger.error(`❌ Gagal mengambil ISP untuk ${domainOrIp}:`, error.message);
    return 'Failed to get ISP'; 
  }
}

function censorAccountUsername(username) {
  if (!username || typeof username !== 'string') {
    return 'N/A'; 
  }
  if (username.length <= 3) {
    return username + 'xxx'; 
  }
 
  return username.substring(0, 3) + 'xxx';
}


async function sendTransactionLogToGroup({
  trxNumber,
  userRole,
  tgUsername,
  tgUserId,
  serverName,
  ispName,
  domainName,
  accountUsername,
  serviceName,
  limitQuota,
  limitLogin,
  trxType,
  activeDays,
  costValue,
  hargaNormalPerHari,
  saldoDikurangi,
  userSaldoNow,
  dateLabel,
  timeLabel
}) {
  const groupData = getBotGroupData();
  if (!groupData || !groupData.chatId || !groupData.keyGroup) {
    logger.warn('❌ Data grup tidak lengkap (chatId atau keyGroup), notifikasi tidak dikirim.');
    return;
  }

  let statusEmoji = '👤';
  let statusText = 'Member';
  if (userRole === 'admin') { statusEmoji = '👑'; statusText = 'Admin'; }
  else if (userRole === 'reseller') { statusEmoji = '🏆'; statusText = 'Reseller'; }

  const censoredAccountUsername = censorAccountUsername(accountUsername);

  const message =
`📦 *TRANSAKSI BERHASIL* 📦

\`\`\`
📒 No Trx       : #${trxNumber}
🌀 Status       : ${statusText} ${statusEmoji}
👤 Username     : ${tgUsername}
🆔 ID           : ${tgUserId}

🌐 Server       : ${serverName}
📡 ISP          : ${ispName}
🔗 Domain/IP    : ${domainName}
🙍 Nama         : ${censoredAccountUsername}

📦 Produk       : ${serviceName}
📊 Limit Quota  : ${limitQuota} GB
📱 Limit Login  : ${limitLogin} HP
⚙️ Tipe         : ${trxType}
⏳ Durasi Akun  : ${activeDays} Hari — Rp.${costValue.toLocaleString('id-ID')}
💲 Normal/Hari  : Rp.${hargaNormalPerHari.toLocaleString('id-ID')}

💳 Saldo Keluar : Rp.${saldoDikurangi.toLocaleString('id-ID')}
💰 Saldo Now    : Rp.${userSaldoNow.toLocaleString('id-ID')}

📅 Tanggal      : ${dateLabel}
⏰ Waktu        : ${timeLabel}
\`\`\`

📝 Catatan: Simpan nomor transaksi untuk support`;

  try {
    await axios.post(`https://api.telegram.org/bot${groupData.keyGroup}/sendMessage`, {
      chat_id: groupData.chatId,
      text: message,
      parse_mode: 'Markdown'
    });
    logger.info(`✅ Log transaksi #${trxNumber} dikirim ke grup ${groupData.chatId}`);
  } catch (err) {
    logger.error(`❌ Gagal kirim log transaksi ke grup: ${err.response?.data?.description || err.message}`);
  }
}

// --- AKHIR FUNGSI sendTransactionLogToGroup ---

// --- AKHIR FUNGSI sendTransactionLogToGroup ---


// --- BAGIAN FUNGSI afterAccountTransaction (GANTI SELURUHNYA) ---
async function afterAccountTransaction({
  userId,
  username,
  produk,
  serverId,
  jenis,
  durasi,
  accountUsername // Ini adalah username akun VPN yang sebenarnya dari state.username
}) {
  try {
    const now = new Date();

    // Ambil informasi server dari DB
    const serverDetails = await new Promise((resolve, reject) => {
      db.get('SELECT nama_server, harga, domain, quota, iplimit FROM Server WHERE id = ?', [serverId], (err, row) => {
        if (err) {
          logger.error('❌ Gagal mengambil data server:', err.message);
          return reject(err);
        }
        resolve(row || {});
      });
    });

    const serverNamaTampilan = serverDetails.nama_server || '-';
    const hargaPerHari = serverDetails.harga || 0;
    const domainServer = serverDetails.domain || '-';
    const quotaServer = serverDetails.quota || 0;
    const iplimitServer = serverDetails.iplimit || 0;

    // Panggil fungsi untuk mendapatkan ISP Name dari sumber eksternal
    const ispServer = await getIspNameFromExternalSource(domainServer);

    let totalHarga = hargaPerHari * durasi;

    // Ambil role user saat ini
    const userRole = await new Promise((resolve) => {
        db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
            resolve(row ? row.role : 'member');
        });
    });

    // Terapkan diskon reseller jika role adalah 'reseller'
    if (userRole === 'reseller') {
        const resellerDiscount = await new Promise((resolve) => {
            db.get('SELECT discount_percent FROM reseller_config WHERE id = 1', (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.discount_percent : 0);
            });
        });
        totalHarga = Math.floor(totalHarga * (100 - resellerDiscount) / 100);
    }

    // Ambil nomor transaksi terakhir
    const trxNumber = await getLastTransactionNumber();

    // Ambil saldo terbaru user
    const saldo = await getUserSaldo(userId);

    // Format tanggal dan waktu
    const tanggal = now.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).replace(/\//g, '.');

    const waktu = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    }).replace(/\./g, ':') + ' WIB';

    // Kirim log transaksi ke grup
    await sendTransactionLogToGroup({
      trxNumber,
      userRole: adminIds.includes(userId) ? 'admin' : userRole,
      tgUsername: username ? (username.startsWith('@') ? username : `@${username}`) : 'Tidak tersedia',
      tgUserId: userId,
      serverName: serverNamaTampilan,
      ispName: ispServer,
      domainName: domainServer,
      accountUsername: accountUsername, // Pastikan ini meneruskan username yang sebenarnya
      serviceName: produk || 'Tidak diketahui',
      limitQuota: quotaServer,
      limitLogin: iplimitServer,
      trxType: jenis || 'Create',
      activeDays: durasi || 0,
      costValue: totalHarga || 0,
      hargaNormalPerHari: hargaPerHari || 0,
      saldoDikurangi: totalHarga || 0,
      userSaldoNow: saldo || 0,
      dateLabel: tanggal,
      timeLabel: waktu
    });

    logger.info(`✅ afterAccountTransaction selesai untuk user ${userId}, transaksi #${trxNumber}`);
  } catch (error) {
    logger.error(`❌ Error afterAccountTransaction user ${userId}:`, error?.stack || error?.message || error);
  }
}


// Dapatkan nomor transaksi terakhir
function getLastTransactionNumber() {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM log_penjualan ORDER BY id DESC LIMIT 1', (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.id + 1 : 1000);
    });
  });
}

// Ambil saldo user dari database
function getUserSaldo(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.saldo : 0);
    });
  });
}

async function sendPaymentSuccessNotificationByUserId(userId, deposit, currentBalance, username = 'Tidak tersedia') {
  try {
    const hasBonus = deposit.bonus && deposit.bonus > 0 && deposit.bonus_percent;
    const bonusLine = hasBonus
      ? `🎁 Bonus           : Rp.${(deposit.bonus || 0).toLocaleString('id-ID')} (${deposit.bonus_percent || 0}%)\n`
      : '';

    const now = new Date();
    const tanggal = now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.');
    const waktu = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(/\./, ':') + ' WIB';

    // ===== Pesan ke USER =====
    const messageText =
      `✅ *Pembayaran Berhasil!*\n\n` +
      `💰 Jumlah Deposit: Rp ${(deposit.originalAmount || deposit.amount).toLocaleString('id-ID')}\n` +
      `💰 Biaya Admin: Rp ${((deposit.amount || 0) - (deposit.originalAmount || deposit.amount)).toLocaleString('id-ID')}\n` +
      `💰 Total Pembayaran: Rp ${deposit.amount.toLocaleString('id-ID')}\n` +
      `${bonusLine}` +
      `💳 Saldo Sekarang: Rp ${currentBalance.toLocaleString('id-ID')}`;

    await bot.telegram.sendMessage(userId, messageText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💸 Top Up', callback_data: 'menu_topup' },
            { text: '📝 Menu Utama', callback_data: 'send_main_menu' }
          ]
        ]
      }
    });

    // Hapus pesan QRIS (jika ada)
    if (deposit.qrMessageId) {
      try {
        await bot.telegram.deleteMessage(userId, deposit.qrMessageId);
      } catch (e) {
        logger.warn(`Gagal hapus pesan QRIS user ${userId} (message_id ${deposit.qrMessageId}): ${e.message}`);
      }
    }

    // ===== Pesan ke GRUP =====
    const group = getBotGroupData();
    if (group) {
      const { keyGroup, chatId } = group;
      const tgUsername = username !== 'Tidak tersedia' ? `@${username}` : `user_${userId}`;

      const messageToGroup =
`💰 *TOP UP BERHASIL* 💰

\`\`\`
👤 Username     : ${tgUsername}
🆔 ID           : ${userId}

💵 Nominal      : Rp.${(deposit.originalAmount || deposit.amount).toLocaleString('id-ID')}
💳 Biaya Admin  : Rp.${((deposit.amount || 0) - (deposit.originalAmount || deposit.amount)).toLocaleString('id-ID')}
💰 Total Bayar  : Rp.${deposit.amount.toLocaleString('id-ID')}
${bonusLine}💳 Saldo Now    : Rp.${currentBalance.toLocaleString('id-ID')}

📅 Tanggal      : ${tanggal}
⏰ Waktu        : ${waktu}
\`\`\`

📝 Catatan: Simpan nomor transaksi untuk support`;

      try {
        await axios.post(`https://api.telegram.org/bot${keyGroup}/sendMessage`, {
          chat_id: chatId,
          text: messageToGroup,
          parse_mode: 'Markdown'
        });
      } catch (err) {
        logger.warn(`❗ Gagal kirim notif deposit ke grup: ${err.response?.data?.description || err.message}`);
      }
    }

    return true;
  } catch (error) {
    logger.error('❌ Error sending payment notification (by userId):', error);
    return false;
  }
}


// Anda mungkin perlu menyesuaikan fungsi ini sesuai dengan data yang Anda butuhkan
async function processMatchingPayment(deposit, matchingTransaction, uniqueCode) {
    // ... logika yang sama dengan yang sudah ada, tetapi sesuaikan akses data
    // Dapatkan data yang diperlukan dari `matchingTransaction`
    const transactionId = matchingTransaction.transaction_id || matchingTransaction.issuer_reff;
    const amount = matchingTransaction.amount;

    // Pastikan username tersedia
    if (!deposit.username) {
      try {
        const telegramUser = await bot.telegram.getChat(deposit.userId);
        deposit.username = telegramUser.username || 'Tidak tersedia';
      } catch (e) {
        deposit.username = 'Tidak tersedia';
      }
    }

    // Cegah duplikasi transaksi
    const transactionKey = `${transactionId}_${amount}`;
    if (global.processedTransactions.has(transactionKey)) {
      logger.info(`Transaction ${transactionKey} already processed, skipping...`);
      return false;
    }

    try {
      // Update saldo utama
      logger.info(`Update saldo untuk user ${deposit.userId}, amount: ${deposit.originalAmount}`);
      await updateUserBalance(deposit.userId, Number(deposit.originalAmount));

      // Ambil config bonus
      const config = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM bonus_config WHERE id = 1', (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      // Hitung bonus jika memenuhi syarat
      let bonus = 0;
      let bonusPercent = 0;

      if (config?.enabled && deposit.originalAmount >= config.min_topup) {
        bonus = Math.floor(deposit.originalAmount * config.bonus_percent / 100);
        bonusPercent = config.bonus_percent;

        deposit.bonus = bonus;
        deposit.bonus_percent = bonusPercent;

        // Tambah bonus ke saldo dan log
        await prosesBonusTopUp(deposit.userId, deposit.username, deposit.originalAmount);
      } else {
        deposit.bonus = 0;
        deposit.bonus_percent = 0;
      }

      // Catat topup ke log
      await logTopup(deposit.userId, deposit.username, deposit.originalAmount, 'QRIS VPNNexus');

      // Ambil saldo terkini
      const userBalance = await new Promise((resolve, reject) => {
        db.get('SELECT saldo FROM users WHERE user_id = ?', [deposit.userId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!userBalance) throw new Error('User balance not found after update');

      // Kirim notifikasi
      const notificationSent = await sendPaymentSuccessNotificationByUserId(
        deposit.userId,
        {
          amount: deposit.originalAmount,
          originalAmount: deposit.originalAmount,
          bonus: deposit.bonus,
          bonus_percent: deposit.bonus_percent,
          qrMessageId: deposit.qrMessageId
        },
        userBalance.saldo,
        deposit.username
      );

      if (notificationSent) {
        global.processedTransactions.add(transactionKey);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('❌ Error processing payment:', error);
      return false;
    }
}

setInterval(async () => {
  try {
    await checkQRISStatus();
  } catch (err) {
    logger.error("❌ Gagal cek status QRIS:", err.message);
  }
}, 5000);
function resetUserSaldo(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET saldo = 0 WHERE user_id = ? AND saldo > 0',
      [userId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

function getUserSaldoById(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT user_id, saldo FROM users WHERE user_id = ?',
      [userId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

function getUsersWithSaldo(limit, offset) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT user_id, saldo FROM users WHERE saldo > 0 ORDER BY saldo DESC LIMIT ? OFFSET ?',
      [limit, offset],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

bot.command('ceksaldo', async (ctx) => {
  const adminOnly = true;
  const userId = ctx.from.id;

  if (adminOnly && !adminIds.includes(userId)) {
    return ctx.reply('❌ Anda tidak memiliki izin untuk menggunakan perintah ini.');
  }

  const input = ctx.message.text.split(' ')[1];
  if (!input) return ctx.reply('⚠️ Contoh: /ceksaldo 123456789');

  const targetId = parseInt(input);
  if (isNaN(targetId)) {
    return ctx.reply('❌ Hanya mendukung ID, bukan username. Contoh: /ceksaldo 123456789');
  }

  try {
    const user = await getUserSaldoById(targetId);
    if (!user) return ctx.reply('❌ User tidak ditemukan.');

    const saldo = `Rp${user.saldo.toLocaleString('id-ID')}`;

    ctx.reply(`📋 *Saldo User:*\n🆔 \`${user.user_id}\`\n💰 ${saldo}`, {
      parse_mode: 'Markdown'
    });
  } catch (err) {
    logger.error('❌ Gagal cek saldo:', err);
    ctx.reply('❌ Terjadi kesalahan saat memeriksa saldo.');
  }
});

function reduceUserSaldoByInput(userId, amount) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET saldo = saldo - ? WHERE user_id = ? AND saldo >= ?',
      [amount, userId, amount],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

bot.command('kurangisaldo', async (ctx) => {
  const adminId = ctx.from.id;
  if (!adminIds.includes(adminId)) {
    return ctx.reply('❌ Anda tidak memiliki izin untuk menggunakan perintah ini.');
  }

  const args = ctx.message.text.trim().split(' ');
  if (args.length !== 3) {
    return ctx.reply('⚠️ Format salah. Contoh: /kurangisaldo 123456789 5000');
  }

  const targetId = parseInt(args[1]);
  const amount = parseInt(args[2]);

  if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
    return ctx.reply('❌ Format salah. Gunakan ID dan nominal angka yang valid.');
  }

  try {
    const user = await getUserSaldoById(targetId);
    if (!user) {
      return ctx.reply('❌ User tidak ditemukan.');
    }

    if (user.saldo < amount) {
      return ctx.reply(`❌ Saldo user hanya Rp${user.saldo.toLocaleString('id-ID')}, tidak cukup.`);
    }

    const success = await reduceUserSaldoByInput(targetId, amount);
    if (!success) {
      return ctx.reply('❌ Gagal mengurangi saldo. Mungkin saldo tidak cukup.');
    }

    const newUser = await getUserSaldoById(targetId);
    const newSaldo = `Rp${newUser.saldo.toLocaleString('id-ID')}`;

    return ctx.reply(`✅ Saldo berhasil dikurangi.\n\n🆔 \`${newUser.user_id}\`\n💰 Saldo Sekarang: *${newSaldo}*`, {
      parse_mode: 'Markdown'
    });
  } catch (err) {
    logger.error('❌ Gagal mengurangi saldo user:', err);
    return ctx.reply('❌ Terjadi kesalahan saat mengurangi saldo.');
  }
});

bot.command('resetsaldo', async (ctx) => {
  const adminOnly = true;
  const userId = ctx.from.id;

  if (adminOnly && !adminIds.includes(userId)) {
    return ctx.reply('❌ Anda tidak memiliki izin untuk menggunakan perintah ini.');
  }

  const input = ctx.message.text.split(' ')[1];
  if (!input) return ctx.reply('⚠️ Contoh: /resetsaldo 123456789 atau /resetsaldo @user');

  try {
    const success = await resetUserSaldo(input);
    if (success) {
      ctx.reply(`✅ Saldo untuk user *${input}* telah direset ke 0.`, { parse_mode: 'Markdown' });
    } else {
      ctx.reply(`❌ Gagal reset saldo. Mungkin user tidak ditemukan atau saldonya sudah 0.`);
    }
  } catch (err) {
    logger.error('❌ Gagal reset saldo:', err);
    ctx.reply('❌ Terjadi kesalahan saat mereset saldo.');
  }
});



function getTotalUserWithSaldo() {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM users WHERE saldo > 0', (err, row) => {
      if (err) return reject(err);
      resolve(row.count);
    });
  });
}

async function sendPaginatedUserSaldo(ctx, page = 1, isEdit = false) {
  const perPage = 10;
  const offset = (page - 1) * perPage;

  try {
    const [users, total] = await Promise.all([
      getUsersWithSaldo(perPage, offset),
      getTotalUserWithSaldo()
    ]);

    if (users.length === 0) {
      return ctx.reply('📭 Tidak ada data saldo untuk ditampilkan.');
    }

    let message = `<b>📋 Daftar Saldo User (Halaman ${page})</b>\n\n`;

    for (const user of users) {
      // Panggil fungsi untuk mendapatkan username Telegram
      const username = await getUsernameById(user.user_id);

      message += `🏷️ @${username}\n` +
                 `🆔 <code>${user.user_id}</code>\n` +
                 `💰 Rp.${user.saldo.toLocaleString('id-ID')}\n\n`;
    }

    const hasNext = offset + perPage < total;

    const keyboard = {
      inline_keyboard: [[
        ...(page > 1 ? [{ text: '⬅️ Prev', callback_data: `listsaldo_${page - 1}` }] : []),
        ...(hasNext ? [{ text: '➡️ Next', callback_data: `listsaldo_${page + 1}` }] : [])
      ]]
    };

    if (isEdit && ctx.callbackQuery?.message) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id,
        null,
        message,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    } else {
      return ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    }

  } catch (err) {
    logger.error('❌ Gagal mengambil daftar saldo:', err);
    return ctx.reply('❌ Terjadi kesalahan saat mengambil daftar saldo.');
  }
}

bot.command('listsaldo', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) {
    return ctx.reply('❌ Anda tidak memiliki izin untuk melihat daftar saldo.');
  }

  await sendPaginatedUserSaldo(ctx, 1);
});

// [UPDATE: Fungsi downgradeInactiveResellers]
async function downgradeInactiveResellers() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    db.all(`SELECT user_id, username FROM users WHERE role = 'reseller'`, [], async (err, resellers) => {
        if (err) {
            logger.error('❌ Error mengambil daftar reseller untuk downgrade:', err.message);
            return;
        }

        for (const reseller of resellers) {
            // Jangan downgrade admin jika mereka juga reseller
            if (adminIds.includes(reseller.user_id)) {
                continue;
            }

            db.get(`
                SELECT COUNT(*) AS total_transactions
                FROM log_penjualan
                WHERE user_id = ? AND waktu_transaksi >= ? AND action_type IN ('create', 'renew')
            `, [reseller.user_id, thirtyDaysAgo], (err, row) => {
                if (err) {
                    logger.error(`❌ Error cek transaksi reseller ${reseller.user_id}:`, err.message);
                    return;
                }

                const totalTransactions = row?.total_transactions || 0;

                if (totalTransactions < 3) {
                    db.run(`UPDATE users SET role = 'member' WHERE user_id = ?`, [reseller.user_id], (err) => {
                        if (err) {
                            logger.error(`❌ Gagal downgrade reseller ${reseller.user_id}:`, err.message);
                        } else {
                            logger.info(`📉 Reseller ${reseller.user_id} didowngrade ke member (transaksi: ${totalTransactions})`);
                            bot.telegram.sendMessage(reseller.user_id,
                                '⚠️ *Pemberitahuan Penting: Role Reseller Anda telah dinonaktifkan.*\n\n' +
                                'Anda telah didowngrade menjadi *Member Biasa* karena jumlah transaksi Anda dalam 30 hari terakhir kurang dari 3 transaksi. ' +
                                'Jika Anda ingin menjadi Reseller kembali, silakan hubungi administrator.',
                                { parse_mode: 'Markdown' }
                            ).catch(e => logger.warn(`Gagal kirim notif downgrade ke ${reseller.user_id}: ${e.message}`));
                        }
                    });
                } else {
                    logger.info(`✅ Reseller ${reseller.user_id} aktif (transaksi: ${totalTransactions})`);
                }
            });
        }
    });
}
// [END UPDATE]


process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection:', reason);
});

app.listen(port)
  .on('listening', () => {
    logger.info(`Express server listening on port ${port}`);
    
// =======================
// GLOBAL SAFETY WRAPPERS (Auto-inserted)
// =======================
// This section adds global error handlers and automatically wraps bot handlers
// so the bot will not crash on uncaught errors. It also adds safer wrappers
// for setInterval/setTimeout and axios to log errors without exiting.
const util = require('util');

// Wrap async handlers to catch errors and reply gracefully when possible
function wrapHandler(fnName, fn) {
  if (!fn) return fn;
  return async function wrapped(...args) {
    try {
      return await fn.apply(this, args);
    } catch (err) {
      try {
        logger.error(`❌ Unhandled error in handler (${fnName}): ${err && (err.stack || err.message)}`);
      } catch(e) {
        console.error('Logger failed:', e);
        console.error(err && (err.stack || err));
      }
      // Attempt to notify user if ctx-like object present
      const maybeCtx = args[0];
      try {
        if (maybeCtx && typeof maybeCtx.reply === 'function') {
          await maybeCtx.reply('⚠️ Terjadi kesalahan internal, silakan coba lagi nanti.');
        } else if (maybeCtx && maybeCtx.answerCbQuery) {
          // best-effort for callback queries
          await maybeCtx.answerCbQuery('⚠️ Terjadi kesalahan internal.');
        }
      } catch (e2) {
        // ignore notification failures
      }
      // swallow error to prevent process exit
      return null;
    }
  };
}

// Monkey-patch Telegraf registration helpers to auto-wrap handlers
try {
  const _origCommand = bot.command.bind(bot);
  bot.command = function (cmd, ...fns) {
    const wrapped = fns.map(fn => (typeof fn === 'function' ? wrapHandler(`command:${cmd}`, fn) : fn));
    return _origCommand(cmd, ...wrapped);
  };

  const _origAction = bot.action.bind(bot);
  bot.action = function (pattern, ...fns) {
    const wrapped = fns.map(fn => (typeof fn === 'function' ? wrapHandler(`action:${pattern}`, fn) : fn));
    return _origAction(pattern, ...wrapped);
  };

  const _origHears = bot.hears ? bot.hears.bind(bot) : null;
  if (_origHears) {
    bot.hears = function (pattern, ...fns) {
      const wrapped = fns.map(fn => (typeof fn === 'function' ? wrapHandler(`hears:${pattern}`, fn) : fn));
      return _origHears(pattern, ...wrapped);
    };
  }

  const _origOn = bot.on ? bot.on.bind(bot) : null;
  if (_origOn) {
    bot.on = function (event, ...fns) {
      const wrapped = fns.map(fn => (typeof fn === 'function' ? wrapHandler(`on:${event}`, fn) : fn));
      return _origOn(event, ...wrapped);
    };
  }
} catch (e) {
  logger.error('❌ Gagal pasang wrapper Telegraf: ' + (e && e.stack || e));
}

// Safe wrappers for setInterval and setTimeout
const _setInterval = global.setInterval;
global.setInterval = function (fn, ms, ...args) {
  return _setInterval(() => {
    try {
      fn(...args);
    } catch (err) {
      logger.error('❌ Error di setInterval callback: ' + (err && (err.stack || err.message)));
    }
  }, ms);
};
const _setTimeout = global.setTimeout;
global.setTimeout = function (fn, ms, ...args) {
  return _setTimeout(() => {
    try {
      fn(...args);
    } catch (err) {
      logger.error('❌ Error di setTimeout callback: ' + (err && (err.stack || err.message)));
    }
  }, ms);
};

// Set axios default agar status 101 tidak throw error
axios.defaults.validateStatus = () => true;

// Wrap axios methods to log errors before rethrowing
if (typeof axios !== 'undefined') {
  try {
    const _axiosGet = axios.get.bind(axios);
    axios.get = async function (...args) {
      if (args[1] && typeof args[1] === 'object') {
        args[1].validateStatus = () => true;
      } else if (args.length === 1) {
        args.push({ validateStatus: () => true });
      }
      try {
        return await _axiosGet(...args);
      } catch (err) {
        logger.error('❌ Axios.get error: ' + (err && (err.stack || err.message)));
        throw err;
      }
    };
    const _axiosPost = axios.post.bind(axios);
    axios.post = async function (...args) {
      try {
        return await _axiosPost(...args);
      } catch (err) {
        logger.error('❌ Axios.post error: ' + (err && (err.stack || err.message)));
        throw err;
      }
    };
  } catch (e) {
    logger.error('❌ Gagal pasang wrapper axios: ' + (e && (e.stack || e)));
  }
}

// Global process-level handlers to prevent crashes
process.on('uncaughtException', (err) => {
  try {
    logger.error('🚨 uncaughtException: ' + (err && (err.stack || err.message)));
  } catch (e) {
    console.error('uncaughtException logger failed', e);
    console.error(err && (err.stack || err));
  }
});
process.on('unhandledRejection', (reason, p) => {
  try {
    logger.error('🚨 unhandledRejection: ' + (reason && (reason.stack || reason)));
  } catch (e) {
    console.error('unhandledRejection logger failed', e);
    console.error(reason && (reason.stack || reason));
  }
});


bot.launch().then(() => {
      logger.info("Bot launched");
      // [UPDATE: Menjalankan pengecekan downgrade reseller secara berkala]
      setInterval(() => {
        logger.info('🔁 Menjalankan pengecekan downgrade reseller...');
        downgradeInactiveResellers();
      }, 6 * 60 * 60 * 1000); // Tiap 6 jam
      // [END UPDATE]
    }).catch((err) => {
      logger.error("Bot failed to launch:", err);
    });
  })
  .on('error', (err) => {
    logger.error("Express failed to start:", err.message);
    
// =======================
// GLOBAL SAFETY WRAPPERS (Auto-inserted)
// =======================
// This section adds global error handlers and automatically wraps bot handlers
// so the bot will not crash on uncaught errors. It also adds safer wrappers
// for setInterval/setTimeout and axios to log errors without exiting.
const util = require('util');

// Wrap async handlers to catch errors and reply gracefully when possible
function wrapHandler(fnName, fn) {
  if (!fn) return fn;
  return async function wrapped(...args) {
    try {
      return await fn.apply(this, args);
    } catch (err) {
      try {
        logger.error(`❌ Unhandled error in handler (${fnName}): ${err && (err.stack || err.message)}`);
      } catch(e) {
        console.error('Logger failed:', e);
        console.error(err && (err.stack || err));
      }
      // Attempt to notify user if ctx-like object present
      const maybeCtx = args[0];
      try {
        if (maybeCtx && typeof maybeCtx.reply === 'function') {
          await maybeCtx.reply('⚠️ Terjadi kesalahan internal, silakan coba lagi nanti.');
        } else if (maybeCtx && maybeCtx.answerCbQuery) {
          // best-effort for callback queries
          await maybeCtx.answerCbQuery('⚠️ Terjadi kesalahan internal.');
        }
      } catch (e2) {
        // ignore notification failures
      }
      // swallow error to prevent process exit
      return null;
    }
  };
}

// Monkey-patch Telegraf registration helpers to auto-wrap handlers
try {
  const _origCommand = bot.command.bind(bot);
  bot.command = function (cmd, ...fns) {
    const wrapped = fns.map(fn => (typeof fn === 'function' ? wrapHandler(`command:${cmd}`, fn) : fn));
    return _origCommand(cmd, ...wrapped);
  };

  const _origAction = bot.action.bind(bot);
  bot.action = function (pattern, ...fns) {
    const wrapped = fns.map(fn => (typeof fn === 'function' ? wrapHandler(`action:${pattern}`, fn) : fn));
    return _origAction(pattern, ...wrapped);
  };

  const _origHears = bot.hears ? bot.hears.bind(bot) : null;
  if (_origHears) {
    bot.hears = function (pattern, ...fns) {
      const wrapped = fns.map(fn => (typeof fn === 'function' ? wrapHandler(`hears:${pattern}`, fn) : fn));
      return _origHears(pattern, ...wrapped);
    };
  }

  const _origOn = bot.on ? bot.on.bind(bot) : null;
  if (_origOn) {
    bot.on = function (event, ...fns) {
      const wrapped = fns.map(fn => (typeof fn === 'function' ? wrapHandler(`on:${event}`, fn) : fn));
      return _origOn(event, ...wrapped);
    };
  }
} catch (e) {
  logger.error('❌ Gagal pasang wrapper Telegraf: ' + (e && e.stack || e));
}

// Safe wrappers for setInterval and setTimeout
const _setInterval = global.setInterval;
global.setInterval = function (fn, ms, ...args) {
  return _setInterval(() => {
    try {
      fn(...args);
    } catch (err) {
      logger.error('❌ Error di setInterval callback: ' + (err && (err.stack || err.message)));
    }
  }, ms);
};
const _setTimeout = global.setTimeout;
global.setTimeout = function (fn, ms, ...args) {
  return _setTimeout(() => {
    try {
      fn(...args);
    } catch (err) {
      logger.error('❌ Error di setTimeout callback: ' + (err && (err.stack || err.message)));
    }
  }, ms);
};

// Set axios default agar status 101 tidak throw error
axios.defaults.validateStatus = () => true;

// Wrap axios methods to log errors before rethrowing
if (typeof axios !== 'undefined') {
  try {
    const _axiosGet = axios.get.bind(axios);
    axios.get = async function (...args) {
      if (args[1] && typeof args[1] === 'object') {
        args[1].validateStatus = () => true;
      } else if (args.length === 1) {
        args.push({ validateStatus: () => true });
      }
      try {
        return await _axiosGet(...args);
      } catch (err) {
        logger.error('❌ Axios.get error: ' + (err && (err.stack || err.message)));
        throw err;
      }
    };
    const _axiosPost = axios.post.bind(axios);
    axios.post = async function (...args) {
      try {
        return await _axiosPost(...args);
      } catch (err) {
        logger.error('❌ Axios.post error: ' + (err && (err.stack || err.message)));
        throw err;
      }
    };
  } catch (e) {
    logger.error('❌ Gagal pasang wrapper axios: ' + (e && (e.stack || e)));
  }
}

// Global process-level handlers to prevent crashes
process.on('uncaughtException', (err) => {
  try {
    logger.error('🚨 uncaughtException: ' + (err && (err.stack || err.message)));
  } catch (e) {
    console.error('uncaughtException logger failed', e);
    console.error(err && (err.stack || err));
  }
});
process.on('unhandledRejection', (reason, p) => {
  try {
    logger.error('🚨 unhandledRejection: ' + (reason && (reason.stack || reason)));
  } catch (e) {
    console.error('unhandledRejection logger failed', e);
    console.error(reason && (reason.stack || reason));
  }
});


bot.launch().catch(err => {
      logger.error("Bot fallback launch error:", err.message);
    });
  });
