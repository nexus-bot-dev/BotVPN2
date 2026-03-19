const { execSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, '../sellvpn.db'));

function apiGet(url) {
  try {
    const result = execSync(`curl -s --max-time 15 "${url}"`, { encoding: 'utf8' });
    return JSON.parse(result);
  } catch (e) {
    throw new Error(`curl gagal: ${e.message}`);
  }
}

function getServer(serverId) {
  return new Promise((resolve) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      resolve(err || !server ? null : server);
    });
  });
}

// ==================== RENEW SSH ====================
async function renewssh(username, exp, limitip, serverId) {
  console.log(`Renewing SSH account for ${username} with expiry ${exp} days, limit IP ${limitip} on server ${serverId}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/rensh?auth=${auth}&num=${username}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
🌟 *RENEW SSH PREMIUM* 🌟

🔹 *Informasi Akun*
┌─────────────────────────────
│ Username   : \`${d.username}\`
│ Sebelumnya : \`${d.previous_expiry}\`
│ Ditambah   : \`${d.days_added} Hari\`
│ Kadaluarsa : \`${d.expired}\`
└─────────────────────────────
✅ Akun ${d.username} berhasil diperbarui
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Terjadi kesalahan: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error saat memperbarui SSH:', error.message);
    return '❌ Terjadi kesalahan saat memperbarui SSH. Silakan coba lagi nanti.';
  }
}

// ==================== RENEW VMESS ====================
async function renewvmess(username, exp, quota, limitip, serverId) {
  console.log(`Renewing VMess account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/renws?auth=${auth}&num=${username}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
🌟 *RENEW VMESS PREMIUM* 🌟

🔹 *Informasi Akun*
┌─────────────────────────────
│ Username   : \`${d.username}\`
│ Sebelumnya : \`${d.previous_expiry}\`
│ Ditambah   : \`${d.days_added} Hari\`
│ Kadaluarsa : \`${d.expired}\`
└─────────────────────────────
✅ Akun ${d.username} berhasil diperbarui
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Terjadi kesalahan: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error saat memperbarui VMess:', error.message);
    return '❌ Terjadi kesalahan saat memperbarui VMess. Silakan coba lagi nanti.';
  }
}

// ==================== RENEW VLESS ====================
async function renewvless(username, exp, quota, limitip, serverId) {
  console.log(`Renewing VLess account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/renvl?auth=${auth}&num=${username}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
🌟 *RENEW VLESS PREMIUM* 🌟

🔹 *Informasi Akun*
┌─────────────────────────────
│ Username   : \`${d.username}\`
│ Sebelumnya : \`${d.previous_expiry}\`
│ Ditambah   : \`${d.days_added} Hari\`
│ Kadaluarsa : \`${d.expired}\`
└─────────────────────────────
✅ Akun ${d.username} berhasil diperbarui
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Terjadi kesalahan: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error saat memperbarui VLess:', error.message);
    return '❌ Terjadi kesalahan saat memperbarui VLess. Silakan coba lagi nanti.';
  }
}

// ==================== RENEW TROJAN ====================
async function renewtrojan(username, exp, quota, limitip, serverId) {
  console.log(`Renewing Trojan account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/rentr?auth=${auth}&num=${username}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
🌟 *RENEW TROJAN PREMIUM* 🌟

🔹 *Informasi Akun*
┌─────────────────────────────
│ Username   : \`${d.username}\`
│ Sebelumnya : \`${d.previous_expiry}\`
│ Ditambah   : \`${d.days_added} Hari\`
│ Kadaluarsa : \`${d.expired}\`
└─────────────────────────────
✅ Akun ${d.username} berhasil diperbarui
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Terjadi kesalahan: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error saat memperbarui Trojan:', error.message);
    return '❌ Terjadi kesalahan saat memperbarui Trojan. Silakan coba lagi nanti.';
  }
}

// ==================== RENEW SHADOWSOCKS ====================
async function renewshadowsocks(username, exp, quota, limitip, serverId) {
  console.log(`Renewing Shadowsocks account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/renss?auth=${auth}&num=${username}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
🌟 *RENEW SHADOWSOCKS PREMIUM* 🌟

🔹 *Informasi Akun*
┌─────────────────────────────
│ Username   : \`${d.username}\`
│ Sebelumnya : \`${d.previous_expiry}\`
│ Ditambah   : \`${d.days_added} Hari\`
│ Kadaluarsa : \`${d.expired}\`
└─────────────────────────────
✅ Akun ${d.username} berhasil diperbarui
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Terjadi kesalahan: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error saat memperbarui Shadowsocks:', error.message);
    return '❌ Terjadi kesalahan saat memperbarui Shadowsocks. Silakan coba lagi nanti.';
  }
}

module.exports = { renewshadowsocks, renewtrojan, renewvless, renewvmess, renewssh };
