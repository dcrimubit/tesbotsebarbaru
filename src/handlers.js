const { Api, TelegramClient } = require('gramjs');
const db = require('./database');
const { log } = require('./logger');

const userState = new Map();

async function handleCallbackQuery(client, event) {
    const data = event.data.toString('utf-8');
    const senderId = event.senderId.toString();

    try {
        await event.delete();
    } catch (e) { /* Abaikan */ }
    
    const { sendMainMenu } = require('./bot');

    if (data === 'manage_whitelist') {
        const buttons = client.buildReplyMarkup([
            [Api.KeyboardButtonCallback.create('🟢 Aktifkan Grup', 'activate_whitelist_menu')],
            [Api.KeyboardButtonCallback.create('🔴 Nonaktifkan Grup', 'deactivate_whitelist_menu')],
            [Api.KeyboardButtonCallback.create('📃 Lihat Daftar Whitelist', 'list_whitelist')],
            [Api.KeyboardButtonCallback.create('⬅️ Kembali ke Menu Utama', 'main_menu')]
        ]);
        await client.sendMessage(senderId, { message: '**Kelola Whitelist Grup**\n\nPilih grup mana yang akan menerima pesan forward.', buttons, parseMode: 'markdown' });
    
    } else if (data === 'activate_whitelist_menu') {
        const groups = await db.getAllGroups();
        const nonWhitelisted = groups.filter(g => !g.is_whitelisted);
        if (nonWhitelisted.length === 0) {
            await client.sendMessage(senderId, { message: '✅ Semua grup sudah ada di dalam whitelist.' });
            return;
        }
        const buttons = nonWhitelisted.map(g => [Api.KeyboardButtonCallback.create(g.group_name.substring(0, 30), `whitelist_add_${g.group_id}`)]);
        buttons.push([Api.KeyboardButtonCallback.create('⬅️ Kembali', 'manage_whitelist')]);
        await client.sendMessage(senderId, { message: 'Pilih grup untuk ditambahkan ke whitelist:', buttons: client.buildReplyMarkup(buttons) });
    
    } else if (data.startsWith('whitelist_add_')) {
        const groupId = data.replace('whitelist_add_', '');
        await db.setWhitelistStatus(groupId, true);
        const group = await db.getGroupById(groupId);
        log(`Whitelist diaktifkan untuk grup: "${group.group_name}"`);
        await client.sendMessage(senderId, { message: `🟢 Grup **${group.group_name}** berhasil ditambahkan ke whitelist.`, parseMode: 'markdown' });
        await handleCallbackQuery(client, { ...event, data: Buffer.from('activate_whitelist_menu') });

    } else if (data === 'deactivate_whitelist_menu') {
        const whitelisted = await db.getWhitelistedGroups();
        if (whitelisted.length === 0) {
            await client.sendMessage(senderId, { message: 'ℹ️ Tidak ada grup dalam whitelist untuk dinonaktifkan.' });
            return;
        }
        const buttons = whitelisted.map(g => [Api.KeyboardButtonCallback.create(g.group_name.substring(0, 30), `whitelist_remove_${g.group_id}`)]);
        buttons.push([Api.KeyboardButtonCallback.create('⬅️ Kembali', 'manage_whitelist')]);
        await client.sendMessage(senderId, { message: 'Pilih grup untuk dihapus dari whitelist:', buttons: client.buildReplyMarkup(buttons) });

    } else if (data.startsWith('whitelist_remove_')) {
        const groupId = data.replace('whitelist_remove_', '');
        await db.setWhitelistStatus(groupId, false);
        const group = await db.getGroupById(groupId);
        log(`Whitelist dinonaktifkan untuk grup: "${group.group_name}"`);
        await client.sendMessage(senderId, { message: `🔴 Grup **${group.group_name}** berhasil dihapus dari whitelist.`, parseMode: 'markdown' });
        await handleCallbackQuery(client, { ...event, data: Buffer.from('deactivate_whitelist_menu') });

    } else if (data === 'list_whitelist') {
        const groups = await db.getWhitelistedGroups();
        let message = '📃 **Daftar Grup dalam Whitelist:**\n\n';
        if (groups.length === 0) {
            message += 'Tidak ada grup dalam whitelist saat ini.';
        } else {
            groups.forEach((g, i) => {
                message += `${i+1}. **${g.group_name}**\n   (ID: \`${g.group_id}\`)\n`;
            });
        }
        await client.sendMessage(senderId, { message, parseMode: 'markdown' });
    }
    else if (data === 'change_source') {
        userState.set(senderId, 'awaiting_source_link');
        await client.sendMessage(senderId, { message: '🔗 Silakan kirimkan link pesan yang akan dijadikan sumber.\nContoh: `https://t.me/channel_username/123` atau `https://t.me/c/123456789/456`', parseMode: 'markdown' });
    } else if (data === 'view_source') {
        const link = await db.getSetting('source_message_link');
        await client.sendMessage(senderId, { message: `📍 **Pesan Sumber Saat Ini:**\n${link}`, parseMode: 'markdown' });
    }
    else if (data === 'change_delay') {
        userState.set(senderId, 'awaiting_delay');
        await client.sendMessage(senderId, { message: '⏳ Masukkan delay antar forward (dalam **milidetik**).\nContoh: `5000` untuk 5 detik.', parseMode: 'markdown' });
    } else if (data === 'view_delay') {
        const delay = await db.getSetting('forward_delay');
        await client.sendMessage(senderId, { message: `🕒 Delay forward saat ini adalah: **${delay} ms** (${parseInt(delay)/1000} detik).`, parseMode: 'markdown' });
    }
    else if (data === 'start_forward') {
        await db.updateSetting('forward_status', 'running');
        log('Proses forward DIMULAI oleh pengguna.');
        await client.sendMessage(senderId, { message: '▶️ Proses forward otomatis telah **dimulai**.', parseMode: 'markdown' });
        await sendMainMenu(client, senderId);
    } else if (data === 'pause_forward') {
        await db.updateSetting('forward_status', 'paused');
        log('Proses forward DIJEDA oleh pengguna.');
        await client.sendMessage(senderId, { message: '⏸️ Proses forward otomatis telah **dijeda**.', parseMode: 'markdown' });
        await sendMainMenu(client, senderId);
    } else if (data === 'status_forward') {
        const status = await db.getSetting('forward_status');
        const lastRun = await db.getSetting('last_run_timestamp');
        const formattedLastRun = lastRun === 'Belum pernah berjalan' ? lastRun : new Date(lastRun).toLocaleString('id-ID');
        await client.sendMessage(senderId, { message: `🔄 **Status Forward**\n\nStatus: **${status.toUpperCase()}**\nTerakhir berjalan: ${formattedLastRun}`, parseMode: 'markdown' });
    }
    else if (data === 'help') {
        const { HELP_MESSAGE } = require('./bot');
        await client.sendMessage(senderId, { message: HELP_MESSAGE, parseMode: 'markdown' });
    }
    else if (data === 'main_menu') {
        await sendMainMenu(client, senderId);
    }
}

async function handleNewMessage(client, event) {
    const message = event.message;
    const senderId = message.senderId.toString();

    if (userState.has(senderId)) {
        const state = userState.get(senderId);

        if (state === 'awaiting_source_link') {
            if (message.text && (message.text.includes('t.me/c/') || message.text.includes('t.me/'))) {
                await db.updateSetting('source_message_link', message.text);
                log(`Pesan sumber diubah menjadi: ${message.text}`);
                await client.sendMessage(senderId, { message: `✅ Pesan sumber berhasil diperbarui.` });
            } else {
                await client.sendMessage(senderId, { message: `❌ Format link tidak valid. Harap kirim link pesan Telegram yang benar.` });
            }
        } else if (state === 'awaiting_delay') {
            const delay = parseInt(message.text);
            if (!isNaN(delay) && delay > 500) {
                await db.updateSetting('forward_delay', delay.toString());
                log(`Delay diubah menjadi: ${delay}ms`);
                await client.sendMessage(senderId, { message: `✅ Delay forward berhasil diatur ke ${delay} ms.` });
            } else {
                await client.sendMessage(senderId, { message: `❌ Input tidak valid. Harap masukkan angka (minimal 501 milidetik).` });
            }
        }
        userState.delete(senderId);
    }
}

module.exports = { handleCallbackQuery, handleNewMessage, userState };
