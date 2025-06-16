require('dotenv').config();
const { TelegramClient, Api, events } = require('gramjs');
const { StringSession } = require('gramjs/sessions');
const input = require('input');
const db = require('./database');
const { log } = require('./logger');
const { handleCallbackQuery, handleNewMessage } = require('./handlers');
const { runForwarder } = require('./forwarder');

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const session = new StringSession(process.env.SESSION || '');
const BOT_OWNER_ID = process.env.BOT_OWNER_ID;

const HELP_MESSAGE = `
🤖 **Bantuan Bot Forwarder (v2 - JSON)**

Bot ini berfungsi untuk meneruskan (forward) pesan secara otomatis dan periodik dari satu sumber ke banyak grup tujuan.

1️⃣ **Manajemen Whitelist**
- \`🟢 Aktifkan Grup\`: Menambahkan grup ke daftar penerima.
- \`🔴 Nonaktifkan Grup\`: Menghapus grup dari daftar penerima.
- \`📃 Lihat Daftar\`: Melihat semua grup yang aktif.

2️⃣ **Pesan Sumber**
- \`🔗 Ganti Pesan\`: Mengubah link pesan sumber.
- \`📍 Lihat Pesan\`: Melihat link pesan sumber saat ini.

3️⃣ **Delay Forward**
- \`⏳ Atur Delay\`: Mengubah jeda waktu (dalam milidetik).
- \`🕒 Lihat Delay\`: Melihat jeda waktu yang sedang digunakan.

4️⃣ **Kontrol Forward**
- \`▶️ Mulai\`: Memulai siklus forward otomatis.
- \`⏸️ Jeda\`: Menghentikan sementara siklus forward.
- \`🔄 Status\`: Mengecek status dan waktu jalan terakhir.

Gunakan tombol di bawah ini atau ketik \`/start\` untuk memunculkan menu.
`;

async function sendMainMenu(client, peerId) {
    const status = await db.getSetting('forward_status');
    const statusText = status === 'running' ? 'Berjalan' : 'Dijeda';

    const buttons = client.buildReplyMarkup([
        [Api.KeyboardButtonCallback.create('⚪ Kelola Whitelist Grup', 'manage_whitelist')],
        [Api.KeyboardButtonCallback.create('🔗 Ganti Pesan', 'change_source'), Api.KeyboardButtonCallback.create('📍 Lihat Pesan', 'view_source')],
        [Api.KeyboardButtonCallback.create('⏳ Atur Delay', 'change_delay'), Api.KeyboardButtonCallback.create('🕒 Lihat Delay', 'view_delay')],
        [Api.KeyboardButtonCallback.create('▶️ Mulai', 'start_forward'), Api.KeyboardButtonCallback.create('⏸️ Jeda', 'pause_forward')],
        [Api.KeyboardButtonCallback.create(`🔄 Status: ${statusText}`, 'status_forward'), Api.KeyboardButtonCallback.create('ℹ️ Bantuan', 'help')]
    ]);
    await client.sendMessage(peerId, { message: 'Selamat datang di **Bot Forwarder Otomatis**.\nVersi Database: **JSON**\n\nSilakan pilih menu di bawah:', buttons, parseMode: 'markdown' });
}

(async () => {
    // Memuat database JSON saat startup
    db.initDb();

    const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });

    await client.start({
        phoneNumber: async () => await input.text('Masukkan nomor telepon: '),
        password: async () => await input.text('Masukkan password 2FA: '),
        phoneCode: async () => await input.text('Masukkan kode OTP: '),
        onError: (err) => log(`Error saat login: ${err.message}`),
    });

    log('Anda berhasil login!');
    const currentSession = client.session.save();
    if (process.env.SESSION !== currentSession) {
        log(`\n--- PENTING ---\nSalin Session String di bawah ini dan masukkan ke file .env Anda:\n\n${currentSession}\n\n----------------\n`);
    }
    log(`Bot siap digunakan. Kirim /start ke "Saved Messages" atau chat pribadi Anda.`);
    
    await client.sendMessage('me', { message: '✅ **Bot Forwarder Aktif! (Database: JSON)**\n\nKetik `/start` untuk memulai.', parseMode: 'markdown' });

    // === EVENT LISTENERS ===
    client.addEventHandler(async (event) => {
        const message = event.message;
        if (message.senderId.toString() === BOT_OWNER_ID) {
            if (message.text === '/start') {
                await sendMainMenu(client, BOT_OWNER_ID);
            } else if (message.text === '/help') {
                await client.sendMessage(BOT_OWNER_ID, { message: HELP_MESSAGE, parseMode: 'markdown' });
            } else {
                 await handleNewMessage(client, event);
            }
        }
    }, new events.NewMessage({ incoming: true }));

    client.addEventHandler(async (event) => {
        if (event.userId.toString() === BOT_OWNER_ID) {
            await handleCallbackQuery(client, event);
        }
    }, new events.CallbackQuery({}));

    client.addEventHandler(async (event) => {
        try {
            const chat = await event.getChat();
            if (chat && (chat.className === 'Channel' || chat.className === 'Chat')) {
                 const isJoin = event.addedBy != null || event.inviterId != null;
                 const me = await client.getMe();
                 const isLeave = event.kickedBy != null && event.userId.toString() === me.id.toString();

                 if (isJoin) {
                    await db.addOrUpdateGroup(chat.id.toString(), chat.title);
                    log(`Bergabung dengan grup baru: "${chat.title}" (ID: ${chat.id})`);
                 } else if (isLeave) {
                    await db.removeGroup(chat.id.toString());
                    log(`Keluar/dikeluarkan dari grup: "${chat.title}" (ID: ${chat.id})`);
                 }
            }
        } catch (error) {
            log(`Gagal memproses ChatAction: ${error.message}`);
        }
    }, new events.ChatAction({}));

    // === JADWALKAN FORWARDER ===
    const FORWARD_INTERVAL_MS = 45 * 60 * 1000; // 45 menit
    setInterval(() => runForwarder(client), FORWARD_INTERVAL_MS);
    log(`Forwarder dijadwalkan untuk berjalan setiap ${FORWARD_INTERVAL_MS / 60000} menit.`);
    
    log('Forwarder akan berjalan pertama kali dalam 1 menit.');
    setTimeout(() => runForwarder(client), 60 * 1000);

})();

module.exports = { sendMainMenu, HELP_MESSAGE };