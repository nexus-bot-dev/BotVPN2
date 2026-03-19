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
  console.log(`Renewing SSH for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Gagal: Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/rensh?auth=${auth}&num=${username}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
────────────────────
❇️ *RENEW SSH PREMIUM* ❇️
────────────────────
┌───────────────────
│ Username: \`${d.username}\`
│ Sebelumnya: \`${d.previous_expiry}\`
│ Ditambah: \`${d.days_added} Hari\`
│ Kadaluarsa: \`${d.expired}\`
└───────────────────
✅ *Akun berhasil diperbarui* ✨
*Makasih sudah pakai layanan kami*
`;
    }
    return `❌ Gagal: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error renew SSH:', error.message);
    return '❌ Gagal memperbarui SSH. Silakan coba lagi nanti.';
  }
}

// ==================== RENEW VMESS ====================
async function renewvmess(username, exp, quota, limitip, serverId) {
  console.log(`Renewing VMess for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Gagal: Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/renws?auth=${auth}&num=${username}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
─────────────────────
❇️ *RENEW VMESS PREMIUM* ❇️
─────────────────────
┌────────────────────
│ Username: \`${d.username}\`
│ Sebelumnya: \`${d.previous_expiry}\`
│ Ditambah: \`${d.days_added} Hari\`
│ Kadaluarsa: \`${d.expired}\`
└────────────────────
✅ *Akun berhasil diperbarui* ✨
*Makasih sudah pakai layanan kami*
`;
    }
    return `❌ Gagal: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error renew VMess:', error.message);
    return '❌ Gagal memperbarui VMess. Silakan coba lagi nanti.';
  }
}

// ==================== RENEW VLESS ====================
async function renewvless(username, exp, quota, limitip, serverId) {
  console.log(`Renewing VLess for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Gagal: Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/renvl?auth=${auth}&num=${username}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
─────────────────────
❇️ *RENEW VLESS PREMIUM* ❇️
─────────────────────
┌────────────────────
│ Username: \`${d.username}\`
│ Sebelumnya: \`${d.previous_expiry}\`
│ Ditambah: \`${d.days_added} Hari\`
│ Kadaluarsa: \`${d.expired}\`
└────────────────────
✅ *Akun berhasil diperbarui* ✨
*Makasih sudah pakai layanan kami*
`;
    }
    return `❌ Gagal: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error renew VLess:', error.message);
    return '❌ Gagal memperbarui VLess. Silakan coba lagi nanti.';
  }
}

// ==================== RENEW TROJAN ====================
async function renewtrojan(username, exp, quota, limitip, serverId) {
  console.log(`Renewing Trojan for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Gagal: Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/rentr?auth=${auth}&num=${username}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
─────────────────────
❇️ *RENEW TROJAN PREMIUM* ❇️
─────────────────────
┌────────────────────
│ Username: \`${d.username}\`
│ Sebelumnya: \`${d.previous_expiry}\`
│ Ditambah: \`${d.days_added} Hari\`
│ Kadaluarsa: \`${d.expired}\`
└────────────────────
✅ *Akun berhasil diperbarui* ✨
*Makasih sudah pakai layanan kami*
`;
    }
    return `❌ Gagal: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error renew Trojan:', error.message);
    return '❌ Gagal memperbarui Trojan. Silakan coba lagi nanti.';
  }
}

// ==================== RENEW SHADOWSOCKS ====================
async function renewshadowsocks(username, exp, quota, limitip, serverId) {
  console.log(`Renewing Shadowsocks for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Gagal: Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/renss?auth=${auth}&num=${username}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
─────────────────────
❇️ *RENEW SHDWSK PREMIUM* ❇️
─────────────────────
┌────────────────────
│ Username: \`${d.username}\`
│ Sebelumnya: \`${d.previous_expiry}\`
│ Ditambah: \`${d.days_added} Hari\`
│ Kadaluarsa: \`${d.expired}\`
└────────────────────
✅ *Akun berhasil diperbarui* ✨
*Makasih sudah pakai layanan kami*
`;
    }
    return `❌ Gagal: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error renew Shadowsocks:', error.message);
    return '❌ Gagal memperbarui Shadowsocks. Silakan coba lagi nanti.';
  }
}

module.exports = { renewshadowsocks, renewtrojan, renewvless, renewvmess, renewssh };
