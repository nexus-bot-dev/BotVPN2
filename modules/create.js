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
    if (!server) return '❌ Gagal: Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/trial-ssh?auth=${auth}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
──────────────────────           
                 *✨SSH ACCOUNT✨*
──────────────────────
*Domain* : \`${d.host}\`
*Username* : \`${d.username}\`
*Password* : \`${d.password}\`
*OpenSSH* : \`${d.ports?.openSSH || '22'}\`
*Dropbear* : \`${d.ports?.dropbear || '143, 109'}\`
*DropbearWS*: \`${d.ports?.dropbearWS || '443, 109'}\`
*SSH UDP* : \`${d.ports?.sshUDP || '1-65535'}\`
*SSH WS* : \`${d.ports?.sshWS || '80, 8080'}\`
*SSH WS SSL*: \`${d.ports?.sshWSSSL || '443'}\`
*BadVPN UDP*: \`${d.ports?.badVPN || '7100, 7300'}\`
───────────────────────
🫧*HTTP CUSTOM*
\`${d.formats?.port80 || `${d.host}:80@${d.username}:${d.password}`}\`
───────────────────────
🫧*Payload*: 
\`${d.payloads?.wsNtls || 'GET / HTTP/1.1[crlf]Host: [host][crlf]Connection: Upgrade[crlf]Upgrade: ws[crlf][crlf]'}\`
──────────────────────
🫧*Save Account*: [Click Link](${d.saveLink})
──────────────────────
*📅Expired*: \`${d.expired}\`
*🌐City* : \`${d.city}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Gagal: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error trial SSH:', error.message);
    return '❌ Gagal membuat SSH. Silakan coba lagi nanti.';
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
    if (!server) return '❌ Gagal: Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/trial-vmess?auth=${auth}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
────────────────────── 
              *✨VMESS ACCOUNT✨*
──────────────────────
*Username* : \`${d.user}\`
*Domain* : \`${d.domain}\`
*UUID* : \`${d.uuid}\`
*Alter ID* : \`0\`
*Security* : \`Auto\`
*Path* : \`/vmess\`
*Path gRPC*: \`vmess-grpc\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${d.ws_tls}
\`\`\`
🫧*URL HTTP:*
\`\`\`
${d.ws_none_tls}
\`\`\`
🫧*URL gRPC:*
\`\`\`
${d.grpc}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](${d.openclash})
──────────────────────
⏳*Expired*: \`${d.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Gagal: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error trial VMess:', error.message);
    return '❌ Gagal membuat VMess. Silakan coba lagi nanti.';
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
    if (!server) return '❌ Gagal: Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/trial-vless?auth=${auth}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
────────────────────── 
               *✨VLESS ACCOUNT✨*
──────────────────────
*Username* : \`${d.user}\`
*Domain* : \`${d.domain}\`
*UUID* : \`${d.uuid}\`
*Path* : \`/vless\`
*Path gRPC*: \`vless-grpc\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${d.ws_tls}
\`\`\`
🫧*URL HTTP:*
\`\`\`
${d.ws_none_tls}
\`\`\`
🫧*URL gRPC:*
\`\`\`
${d.grpc}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](${d.openclash})
──────────────────────
⏳*Expired*: \`${d.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Gagal: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error trial VLess:', error.message);
    return '❌ Gagal membuat VLESS. Silakan coba lagi nanti.';
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
    if (!server) return '❌ Gagal: Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/trial-trojan?auth=${auth}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
────────────────────── 
            *✨TROJAN ACCOUNT✨*
──────────────────────
*Username* : \`${d.user}\`
*Domain* : \`${d.domain}\`
*UUID* : \`${d.uuid}\`
*Path* : \`/trojan-ws\`
*Path gRPC*: \`trojan-grpc\`
──────────────────────
🫧*URL WS TLS:*
\`\`\`
${d.ws}
\`\`\`
🫧*URL gRPC:*
\`\`\`
${d.grpc}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](${d.openclash})
──────────────────────
⏳*Expired*: \`${d.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Gagal: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error trial Trojan:', error.message);
    return '❌ Gagal membuat Trojan. Silakan coba lagi nanti.';
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
    if (!server) return '❌ Gagal: Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/trial-shadowsocks?auth=${auth}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
────────────────────── 
      *✨SHADOWSOCKS ACCOUNT✨*
──────────────────────
*Username* : \`${d.user || d.username}\`
*Domain* : \`${d.domain}\`
*UUID* : \`${d.uuid}\`
──────────────────────
⏳*Expired*: \`${d.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Gagal: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error trial Shadowsocks:', error.message);
    return '❌ Gagal membuat Shadowsocks. Silakan coba lagi nanti.';
  }
}

// ==================== CREATE SSH ====================
async function createssh(username, password, exp, iplimit, serverId) {
  console.log(`Creating SSH for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Gagal: Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/create-ssh?auth=${auth}&user=${username}&password=${password}&exp=${exp}&limitip=${iplimit}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
──────────────────────           
                 *✨SSH ACCOUNT✨*
──────────────────────
*Domain* : \`${d.host}\`
*Username* : \`${d.username}\`
*Password* : \`${d.password}\`
*OpenSSH* : \`${d.ports?.openSSH || '22'}\`
*Dropbear* : \`${d.ports?.dropbear || '143, 109'}\`
*DropbearWS*: \`${d.ports?.dropbearWS || '443, 109'}\`
*SSH UDP* : \`${d.ports?.sshUDP || '1-65535'}\`
*SSH WS* : \`${d.ports?.sshWS || '80, 8080'}\`
*SSH WS SSL*: \`${d.ports?.sshWSSSL || '443'}\`
*BadVPN UDP*: \`${d.ports?.badVPN || '7100, 7300'}\`
───────────────────────
🫧*HTTP CUSTOM*
\`${d.formats?.port80 || `${d.host}:80@${d.username}:${d.password}`}\`
───────────────────────
🫧*Payload*: 
\`${d.payloads?.wsNtls || 'GET / HTTP/1.1[crlf]Host: [host][crlf]Connection: Upgrade[crlf]Upgrade: ws[crlf][crlf]'}\`
──────────────────────
🫧*Save Account*: [Click Link](${d.saveLink})
──────────────────────
*📅IP Limit* : \`${d.limitIP}\`
*⏳Expired* : \`${d.expired}\`
*📆Expired Date*: \`${d.expiredDate}\`
*🌐City* : \`${d.city}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Gagal: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error creating SSH:', error.message);
    return '❌ Gagal membuat SSH. Silakan coba lagi nanti.';
  }
}

// ==================== CREATE VMESS ====================
async function createvmess(username, exp, quota, limitip, serverId) {
  console.log(`Creating VMess for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Gagal: Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/create-vmess?auth=${auth}&user=${username}&quota=${quota}&limitip=${limitip}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
────────────────────── 
              *✨VMESS ACCOUNT✨*
──────────────────────
*Username* : \`${d.user}\`
*Domain* : \`${d.domain}\`
*UUID* : \`${d.uuid}\`
*Alter ID* : \`0\`
*Security* : \`Auto\`
*Path* : \`/vmess\`
*Path gRPC*: \`vmess-grpc\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${d.ws_tls}
\`\`\`
🫧*URL HTTP:*
\`\`\`
${d.ws_none_tls}
\`\`\`
🫧*URL gRPC:*
\`\`\`
${d.grpc}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](${d.openclash})
──────────────────────
🚀*Quota*: \`${d.quota === '0 GB' ? 'Unlimited' : d.quota}\`
🌤*IP Limit*: \`${d.limitIP === '0' ? 'Unlimited' : d.limitIP} IP\`
⏳*Expired*: \`${d.expired}\`
📆*Expired Date*: \`${d.expiredDate}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Gagal: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error creating VMess:', error.message);
    return '❌ Gagal membuat VMess. Silakan coba lagi nanti.';
  }
}

// ==================== CREATE VLESS ====================
async function createvless(username, exp, quota, limitip, serverId) {
  console.log(`Creating VLess for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Gagal: Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/create-vless?auth=${auth}&user=${username}&quota=${quota}&limitip=${limitip}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
────────────────────── 
               *✨VLESS ACCOUNT✨*
──────────────────────
*Username* : \`${d.user}\`
*Domain* : \`${d.domain}\`
*UUID* : \`${d.uuid}\`
*Path* : \`/vless\`
*Path gRPC*: \`vless-grpc\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${d.ws_tls}
\`\`\`
🫧*URL HTTP:*
\`\`\`
${d.ws_none_tls}
\`\`\`
🫧*URL gRPC:*
\`\`\`
${d.grpc}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](${d.openclash})
──────────────────────
🚀*Quota*: \`${d.quota === '0 GB' ? 'Unlimited' : d.quota}\`
🌤*IP Limit*: \`${d.limitIP === '0' ? 'Unlimited' : d.limitIP} IP\`
⏳*Expired*: \`${d.expired}\`
📆*Expired Date*: \`${d.expiredDate}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Gagal: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error creating VLess:', error.message);
    return '❌ Gagal membuat VLESS. Silakan coba lagi nanti.';
  }
}

// ==================== CREATE TROJAN ====================
async function createtrojan(username, exp, quota, limitip, serverId) {
  console.log(`Creating Trojan for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Gagal: Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/create-trojan?auth=${auth}&user=${username}&quota=${quota}&limitip=${limitip}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
────────────────────── 
            *✨TROJAN ACCOUNT✨*
──────────────────────
*Username* : \`${d.user}\`
*Domain* : \`${d.domain}\`
*UUID* : \`${d.uuid}\`
*Path* : \`/trojan-ws\`
*Path gRPC*: \`trojan-grpc\`
──────────────────────
🫧*URL WS TLS:*
\`\`\`
${d.ws}
\`\`\`
🫧*URL gRPC:*
\`\`\`
${d.grpc}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](${d.openclash})
──────────────────────
🚀*Quota*: \`${d.quota === '0 GB' ? 'Unlimited' : d.quota}\`
🌤*IP Limit*: \`${d.limitIP === '0' ? 'Unlimited' : d.limitIP} IP\`
⏳*Expired*: \`${d.expired}\`
📆*Expired Date*: \`${d.expiredDate}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Gagal: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error creating Trojan:', error.message);
    return '❌ Gagal membuat Trojan. Silakan coba lagi nanti.';
  }
}

// ==================== CREATE SHADOWSOCKS ====================
async function createshadowsocks(username, exp, quota, limitip, serverId) {
  console.log(`Creating Shadowsocks for ${username}`);
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }
  try {
    const server = await getServer(serverId);
    if (!server) return '❌ Gagal: Server tidak ditemukan. Silakan coba lagi.';
    const { domain, auth } = server;
    const res = apiGet(`http://${domain}:6969/api/create-shadowsocks?auth=${auth}&user=${username}&quota=${quota}&limitip=${limitip}&exp=${exp}`);
    if (res && res.status === "success") {
      const d = res.data;
      return `
────────────────────── 
      *✨SHADOWSOCKS ACCOUNT✨*
──────────────────────
*Username* : \`${d.user || d.username}\`
*Domain* : \`${d.domain}\`
──────────────────────
🚀*Quota*: \`${d.quota === '0 GB' ? 'Unlimited' : d.quota}\`
🌤*IP Limit*: \`${d.limitIP === '0' ? 'Unlimited' : d.limitIP} IP\`
⏳*Expired*: \`${d.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
    }
    return `❌ Gagal: ${res?.message || 'Server tidak merespons dengan benar.'}`;
  } catch (error) {
    console.error('Error creating Shadowsocks:', error.message);
    return '❌ Gagal membuat Shadowsocks. Silakan coba lagi nanti.';
  }
}

module.exports = { trialssh, trialvmess, trialvless, trialtrojan, trialshadowsocks, createssh, createvmess, createvless, createtrojan, createshadowsocks };
