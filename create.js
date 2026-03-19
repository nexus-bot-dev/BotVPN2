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

// ==================== TRIAL SSH ====================
async function trialssh(username, password, exp, iplimit, serverId) {
  console.log(`Trial SSH for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/trial-ssh?auth=${auth}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
🌟 *TRIAL SSH* 🌟

🔹 *Informasi Akun*
┌─────────────────────
│ *Username* : \`${d.username}\`
│ *Password* : \`${d.password}\`
└─────────────────────
┌─────────────────────
│ *Domain*   : \`${d.host}\`
│ *OpenSSH*  : \`${d.ports?.openSSH || '22'}\`
│ *Dropbear* : \`${d.ports?.dropbear || '143, 109'}\`
│ *SSH WS*   : \`${d.ports?.sshWS || '80, 8080'}\`
│ *SSH SSL WS*: \`${d.ports?.sshWSSSL || '443'}\`
│ *SSH UDP*  : \`${d.ports?.sshUDP || '1-65535'}\`
│ *BadVPN UDP*: \`${d.ports?.badVPN || '7100, 7300'}\`
│ *OVPN WS SSL*: \`${d.ports?.ovpnWSSSL || '443'}\`
└─────────────────────
🔗 *Link dan Payload*
───────────────────────
HTTP Custom      : 
\`${d.formats?.port80 || `${d.host}:80@${d.username}:${d.password}`}\`
Payload WSS      : 
\`\`\`
${d.payloads?.wsNtls || 'GET / HTTP/1.1[crlf]Host: [host][crlf]Upgrade: ws[crlf][crlf]'}
\`\`\`
Save Account Link: [Save Account](${d.saveLink})
───────────────────────
┌─────────────────────
│ Expires: \`${d.expired}\`
│ City: \`${d.city}\`
└─────────────────────

✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Terjadi kesalahan: ${res?.message || 'Server tidak merespons.'}`;
  } catch (error) {
    console.error('Error trial SSH:', error.message);
    return '❌ Terjadi kesalahan saat membuat SSH. Silakan coba lagi nanti.';
  }
}

// ==================== TRIAL VMESS ====================
async function trialvmess(username, exp, quota, limitip, serverId) {
  console.log(`Trial VMess for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/trial-vmess?auth=${auth}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
🌟 *TRIAL VMESS* 🌟

🔹 *Informasi Akun*
┌─────────────────────
│ *Username* : \`${d.user}\`
│ *Domain*   : \`${d.domain}\`
│ *Alter ID* : \`0\`
│ *Security* : \`Auto\`
│ *Network*  : \`Websocket (WS)\`
│ *Path*     : \`/vmess\`
│ *Path GRPC*: \`vmess-grpc\`
└─────────────────────
🔐 *URL VMESS TLS*
\`\`\`
${d.ws_tls}
\`\`\`
🔓 *URL VMESS HTTP*
\`\`\`
${d.ws_none_tls}
\`\`\`
🔒 *URL VMESS GRPC*
\`\`\`
${d.grpc}
\`\`\`
┌─────────────────────
│ Expires: \`${d.expired}\`
└─────────────────────
Save Account Link: [Save Account](${d.openclash})
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Terjadi kesalahan: ${res?.message || 'Server tidak merespons.'}`;
  } catch (error) {
    console.error('Error trial VMess:', error.message);
    return '❌ Terjadi kesalahan saat membuat VMess. Silakan coba lagi nanti.';
  }
}

// ==================== TRIAL VLESS ====================
async function trialvless(username, exp, quota, limitip, serverId) {
  console.log(`Trial VLess for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/trial-vless?auth=${auth}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
🌟 *TRIAL VLESS* 🌟

🔹 *Informasi Akun*
┌─────────────────────
│ *Username* : \`${d.user}\`
│ *Domain*   : \`${d.domain}\`
│ *Security* : \`Auto\`
│ *Network*  : \`Websocket (WS)\`
│ *Path*     : \`/vless\`
│ *Path GRPC*: \`vless-grpc\`
└─────────────────────
🔐 *URL VLESS TLS*
\`\`\`
${d.ws_tls}
\`\`\`
🔓 *URL VLESS HTTP*
\`\`\`
${d.ws_none_tls}
\`\`\`
🔒 *URL VLESS GRPC*
\`\`\`
${d.grpc}
\`\`\`
┌─────────────────────
│ Expires: \`${d.expired}\`
└─────────────────────
Save Account Link: [Save Account](${d.openclash})
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Terjadi kesalahan: ${res?.message || 'Server tidak merespons.'}`;
  } catch (error) {
    console.error('Error trial VLess:', error.message);
    return '❌ Terjadi kesalahan saat membuat VLESS. Silakan coba lagi nanti.';
  }
}

// ==================== TRIAL TROJAN ====================
async function trialtrojan(username, exp, quota, limitip, serverId) {
  console.log(`Trial Trojan for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/trial-trojan?auth=${auth}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
🌟 *TRIAL TROJAN* 🌟

🔹 *Informasi Akun*
┌─────────────────────
│ *Username* : \`${d.user}\`
│ *Domain*   : \`${d.domain}\`
│ *Network*  : \`Websocket (WS)\`
│ *Path*     : \`/trojan-ws\`
│ *Path GRPC*: \`trojan-grpc\`
└─────────────────────
🔐 *URL TROJAN WS TLS*
\`\`\`
${d.ws}
\`\`\`
🔒 *URL TROJAN GRPC*
\`\`\`
${d.grpc}
\`\`\`
┌─────────────────────
│ Expires: \`${d.expired}\`
└─────────────────────
Save Account Link: [Save Account](${d.openclash})
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Terjadi kesalahan: ${res?.message || 'Server tidak merespons.'}`;
  } catch (error) {
    console.error('Error trial Trojan:', error.message);
    return '❌ Terjadi kesalahan saat membuat Trojan. Silakan coba lagi nanti.';
  }
}

// ==================== TRIAL SHADOWSOCKS ====================
async function trialshadowsocks(username, exp, quota, limitip, serverId) {
  console.log(`Trial Shadowsocks for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/trial-shadowsocks?auth=${auth}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
🌟 *TRIAL SHADOWSOCKS* 🌟

🔹 *Informasi Akun*
┌─────────────────────
│ *Username* : \`${d.user || d.username}\`
│ *Domain*   : \`${d.domain}\`
└─────────────────────
┌─────────────────────
│ Expires: \`${d.expired}\`
└─────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Terjadi kesalahan: ${res?.message || 'Server tidak merespons.'}`;
  } catch (error) {
    console.error('Error trial Shadowsocks:', error.message);
    return '❌ Terjadi kesalahan saat membuat Shadowsocks. Silakan coba lagi nanti.';
  }
}

// ==================== CREATE SSH ====================
async function createssh(username, password, exp, iplimit, serverId) {
  console.log(`Creating SSH account for ${username} with expiry ${exp} days, IP limit ${iplimit}, and password ${password}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/create-ssh?auth=${auth}&user=${username}&password=${password}&exp=${exp}&limitip=${iplimit}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
🌟 *AKUN SSH PREMIUM* 🌟

🔹 *Informasi Akun*
┌─────────────────────
│ *Username* : \`${d.username}\`
│ *Password* : \`${d.password}\`
└─────────────────────
┌─────────────────────
│ *Domain*   : \`${d.host}\`
│ *OpenSSH*  : \`${d.ports?.openSSH || '22'}\`
│ *Dropbear* : \`${d.ports?.dropbear || '143, 109'}\`
│ *SSH WS*   : \`${d.ports?.sshWS || '80, 8080'}\`
│ *SSH SSL WS*: \`${d.ports?.sshWSSSL || '443'}\`
│ *SSH UDP*  : \`${d.ports?.sshUDP || '1-65535'}\`
│ *BadVPN UDP*: \`${d.ports?.badVPN || '7100, 7300'}\`
│ *OVPN WS SSL*: \`${d.ports?.ovpnWSSSL || '443'}\`
│ *OVPN TCP* : \`${d.ports?.ovpnTCP || '1194'}\`
│ *OVPN UDP* : \`${d.ports?.ovpnUDP || '2200'}\`
└─────────────────────
🔗 *Link dan Payload*
───────────────────────
HTTP Custom      : 
\`${d.formats?.port80 || `${d.host}:80@${d.username}:${d.password}`}\`
Payload WSS      : 
\`\`\`
${d.payloads?.wsNtls || 'GET / HTTP/1.1[crlf]Host: [host][crlf]Upgrade: ws[crlf][crlf]'}
\`\`\`
Save Account Link: [Save Account](${d.saveLink})
───────────────────────
┌─────────────────────
│ Expires: \`${d.expired}\`
│ Exp Date: \`${d.expiredDate}\`
│ IP Limit: \`${d.limitIP}\`
│ City: \`${d.city}\`
└─────────────────────

✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Terjadi kesalahan: ${res?.message || 'Server tidak merespons.'}`;
  } catch (error) {
    console.error('Error creating SSH:', error.message);
    return '❌ Terjadi kesalahan saat membuat SSH. Silakan coba lagi nanti.';
  }
}

// ==================== CREATE VMESS ====================
async function createvmess(username, exp, quota, limitip, serverId) {
  console.log(`Creating VMess account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/create-vmess?auth=${auth}&user=${username}&quota=${quota}&limitip=${limitip}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
🌟 *AKUN VMESS PREMIUM* 🌟

🔹 *Informasi Akun*
┌─────────────────────
│ *Username* : \`${d.user}\`
│ *Domain*   : \`${d.domain}\`
│ *Alter ID* : \`0\`
│ *Security* : \`Auto\`
│ *Network*  : \`Websocket (WS)\`
│ *Path*     : \`/vmess\`
│ *Path GRPC*: \`vmess-grpc\`
└─────────────────────
🔐 *URL VMESS TLS*
\`\`\`
${d.ws_tls}
\`\`\`
🔓 *URL VMESS HTTP*
\`\`\`
${d.ws_none_tls}
\`\`\`
🔒 *URL VMESS GRPC*
\`\`\`
${d.grpc}
\`\`\`
🔑 *UUID*
\`\`\`
${d.uuid}
\`\`\`
┌─────────────────────
│ Expiry: \`${d.expired}\`
│ Exp Date: \`${d.expiredDate}\`
│ Quota: \`${d.quota === '0 GB' ? 'Unlimited' : d.quota}\`
│ IP Limit: \`${d.limitIP === '0' ? 'Unlimited' : d.limitIP} IP\`
└─────────────────────
Save Account Link: [Save Account](${d.openclash})
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Terjadi kesalahan: ${res?.message || 'Server tidak merespons.'}`;
  } catch (error) {
    console.error('Error creating VMess:', error.message);
    return '❌ Terjadi kesalahan saat membuat VMess. Silakan coba lagi nanti.';
  }
}

// ==================== CREATE VLESS ====================
async function createvless(username, exp, quota, limitip, serverId) {
  console.log(`Creating VLESS account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/create-vless?auth=${auth}&user=${username}&quota=${quota}&limitip=${limitip}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
🌟 *AKUN VLESS PREMIUM* 🌟

🔹 *Informasi Akun*
┌─────────────────────
│ *Username* : \`${d.user}\`
│ *Domain*   : \`${d.domain}\`
│ *Security* : \`Auto\`
│ *Network*  : \`Websocket (WS)\`
│ *Path*     : \`/vless\`
│ *Path GRPC*: \`vless-grpc\`
└─────────────────────
🔐 *URL VLESS TLS*
\`\`\`
${d.ws_tls}
\`\`\`
🔓 *URL VLESS HTTP*
\`\`\`
${d.ws_none_tls}
\`\`\`
🔒 *URL VLESS GRPC*
\`\`\`
${d.grpc}
\`\`\`
🔑 *UUID*
\`\`\`
${d.uuid}
\`\`\`
┌─────────────────────
│ Expiry: \`${d.expired}\`
│ Exp Date: \`${d.expiredDate}\`
│ Quota: \`${d.quota === '0 GB' ? 'Unlimited' : d.quota}\`
│ IP Limit: \`${d.limitIP === '0' ? 'Unlimited' : d.limitIP} IP\`
└─────────────────────
Save Account Link: [Save Account](${d.openclash})
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Terjadi kesalahan: ${res?.message || 'Server tidak merespons.'}`;
  } catch (error) {
    console.error('Error creating VLess:', error.message);
    return '❌ Terjadi kesalahan saat membuat VLESS. Silakan coba lagi nanti.';
  }
}

// ==================== CREATE TROJAN ====================
async function createtrojan(username, exp, quota, limitip, serverId) {
  console.log(`Creating Trojan account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/create-trojan?auth=${auth}&user=${username}&quota=${quota}&limitip=${limitip}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
🌟 *AKUN TROJAN PREMIUM* 🌟

🔹 *Informasi Akun*
┌─────────────────────
│ *Username* : \`${d.user}\`
│ *Domain*   : \`${d.domain}\`
│ *Network*  : \`Websocket (WS)\`
│ *Path*     : \`/trojan-ws\`
│ *Path GRPC*: \`trojan-grpc\`
└─────────────────────
🔐 *URL TROJAN WS TLS*
\`\`\`
${d.ws}
\`\`\`
🔒 *URL TROJAN GRPC*
\`\`\`
${d.grpc}
\`\`\`
🔑 *UUID*
\`\`\`
${d.uuid}
\`\`\`
┌─────────────────────
│ Expiry: \`${d.expired}\`
│ Exp Date: \`${d.expiredDate}\`
│ Quota: \`${d.quota === '0 GB' ? 'Unlimited' : d.quota}\`
│ IP Limit: \`${d.limitIP === '0' ? 'Unlimited' : d.limitIP} IP\`
└─────────────────────
Save Account Link: [Save Account](${d.openclash})
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Terjadi kesalahan: ${res?.message || 'Server tidak merespons.'}`;
  } catch (error) {
    console.error('Error creating Trojan:', error.message);
    return '❌ Terjadi kesalahan saat membuat Trojan. Silakan coba lagi nanti.';
  }
}

// ==================== CREATE SHADOWSOCKS ====================
async function createshadowsocks(username, exp, quota, limitip, serverId) {
  console.log(`Creating Shadowsocks account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/create-shadowsocks?auth=${auth}&user=${username}&quota=${quota}&limitip=${limitip}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
🌟 *AKUN SHADOWSOCKS PREMIUM* 🌟

🔹 *Informasi Akun*
┌─────────────────────
│ *Username* : \`${d.user || d.username}\`
│ *Domain*   : \`${d.domain}\`
│ *Network*  : \`Websocket (WS)\`
│ *Path*     : \`/ss-ws\`
│ *Path GRPC*: \`ss-grpc\`
└─────────────────────
┌─────────────────────
│ Expiry: \`${d.expired}\`
│ Quota: \`${d.quota === '0 GB' ? 'Unlimited' : d.quota}\`
│ IP Limit: \`${d.limitIP === '0' ? 'Unlimited' : d.limitIP} IP\`
└─────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Terjadi kesalahan: ${res?.message || 'Server tidak merespons.'}`;
  } catch (error) {
    console.error('Error creating Shadowsocks:', error.message);
    return '❌ Terjadi kesalahan saat membuat Shadowsocks. Silakan coba lagi nanti.';
  }
}

module.exports = { trialssh, trialvmess, trialvless, trialtrojan, trialshadowsocks, createssh, createvmess, createvless, createtrojan, createshadowsocks };
