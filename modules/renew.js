const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');

// ==================== RENEW SSH ====================
async function renewssh(username, exp, limitip, serverId) {
  console.log(`Renewing SSH for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');
      const { domain, auth } = server;
      const url = `https://${domain}/api/rensh?auth=${auth}&num=${username}&exp=${exp}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const d = response.data.data;
            const msg = `
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
            return resolve(msg);
          } else {
            return resolve(`❌ Gagal: ${response.data.message || 'Unknown error'}`);
          }
        })
        .catch(error => {
          console.error('Error renew SSH:', error);
          return resolve('❌ Gagal memperbarui SSH. Silakan coba lagi nanti.');
        });
    });
  });
}

// ==================== RENEW VMESS ====================
async function renewvmess(username, exp, quota, limitip, serverId) {
  console.log(`Renewing VMess for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');
      const { domain, auth } = server;
      const url = `https://${domain}/api/renws?auth=${auth}&num=${username}&exp=${exp}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const d = response.data.data;
            const msg = `
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
            return resolve(msg);
          } else {
            return resolve(`❌ Gagal: ${response.data.message || 'Unknown error'}`);
          }
        })
        .catch(error => {
          console.error('Error renew VMess:', error);
          return resolve('❌ Gagal memperbarui VMess. Silakan coba lagi nanti.');
        });
    });
  });
}

// ==================== RENEW VLESS ====================
async function renewvless(username, exp, quota, limitip, serverId) {
  console.log(`Renewing VLess for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');
      const { domain, auth } = server;
      const url = `https://${domain}/api/renvl?auth=${auth}&num=${username}&exp=${exp}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const d = response.data.data;
            const msg = `
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
            return resolve(msg);
          } else {
            return resolve(`❌ Gagal: ${response.data.message || 'Unknown error'}`);
          }
        })
        .catch(error => {
          console.error('Error renew VLess:', error);
          return resolve('❌ Gagal memperbarui VLess. Silakan coba lagi nanti.');
        });
    });
  });
}

// ==================== RENEW TROJAN ====================
async function renewtrojan(username, exp, quota, limitip, serverId) {
  console.log(`Renewing Trojan for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');
      const { domain, auth } = server;
      const url = `https://${domain}/api/rentr?auth=${auth}&num=${username}&exp=${exp}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const d = response.data.data;
            const msg = `
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
            return resolve(msg);
          } else {
            return resolve(`❌ Gagal: ${response.data.message || 'Unknown error'}`);
          }
        })
        .catch(error => {
          console.error('Error renew Trojan:', error);
          return resolve('❌ Gagal memperbarui Trojan. Silakan coba lagi nanti.');
        });
    });
  });
}

// ==================== RENEW SHADOWSOCKS ====================
async function renewshadowsocks(username, exp, quota, limitip, serverId) {
  console.log(`Renewing Shadowsocks for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');
      const { domain, auth } = server;
      const url = `https://${domain}/api/renss?auth=${auth}&num=${username}&exp=${exp}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const d = response.data.data;
            const msg = `
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
            return resolve(msg);
          } else {
            return resolve(`❌ Gagal: ${response.data.message || 'Unknown error'}`);
          }
        })
        .catch(error => {
          console.error('Error renew Shadowsocks:', error);
          return resolve('❌ Gagal memperbarui Shadowsocks. Silakan coba lagi nanti.');
        });
    });
  });
}

module.exports = { renewshadowsocks, renewtrojan, renewvless, renewvmess, renewssh };
