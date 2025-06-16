const db = require('./database');
const { log } = require('./logger');
const { Api } = require('gramjs');
const { TelegramClient } = require('gramjs');

function parseMessageLink(link) {
    const privateMatch = link.match(/t\.me\/c\/(\d+)\/(\d+)/);
    if (privateMatch) {
        return { channelId: BigInt(privateMatch[1]), messageId: parseInt(privateMatch[2]) };
    }
    const publicMatch = link.match(/t\.me\/([a-zA-Z0-9_]+)\/(\d+)/);
    if (publicMatch) {
        return { channelId: publicMatch[1], messageId: parseInt(publicMatch[2]) };
    }
    return null;
}

async function runForwarder(client) {
    log('Memeriksa jadwal forwarder...');
    
    const status = await db.getSetting('forward_status');
    if (status !== 'running') {
        log('Status forwarder "paused", proses dilewati.');
        return;
    }

    const sourceLink = await db.getSetting('source_message_link');
    const delay = parseInt(await db.getSetting('forward_delay'));
    const whitelistedGroups = await db.getWhitelistedGroups();
    
    if (sourceLink === 'BELUM_DIATUR' || !sourceLink) {
        log('Kesalahan: Pesan sumber belum diatur. Proses forwarding dibatalkan.');
        return;
    }

    const sourceInfo = parseMessageLink(sourceLink);
    if (!sourceInfo) {
        log(`Kesalahan: Link pesan sumber tidak valid: ${sourceLink}`);
        return;
    }

    if (whitelistedGroups.length === 0) {
        log('Info: Tidak ada grup di whitelist. Tidak ada pesan yang akan diforward.');
        return;
    }

    log(`Memulai proses forward ke ${whitelistedGroups.length} grup.`);

    for (const group of whitelistedGroups) {
        try {
            const targetPeer = BigInt(group.group_id);
            const sourcePeer = typeof sourceInfo.channelId === 'string' ? sourceInfo.channelId : new Api.PeerChannel({ channelId: sourceInfo.channelId });

            await client.invoke(
                new Api.messages.ForwardMessages({
                    fromPeer: sourcePeer,
                    id: [sourceInfo.messageId],
                    toPeer: targetPeer,
                    randomId: [BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))],
                    dropAuthor: true,
                    noforwards: true,
                })
            );
            log(`Pesan berhasil diforward ke "${group.group_name}" (ID: ${group.group_id})`);
        } catch (error) {
            log(`GAGAL forward ke "${group.group_name}" (ID: ${group.group_id}). Alasan: ${error.message}`);
            if (error.errorMessage === 'FLOOD_WAIT_X') {
                const waitSeconds = error.seconds;
                log(`Flood wait terdeteksi. Menunggu ${waitSeconds} detik...`);
                await new Promise(resolve => setTimeout(resolve, (waitSeconds + 5) * 1000));
            }
        } finally {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    await db.updateSetting('last_run_timestamp', new Date().toISOString());
    log('Siklus forward selesai.');
}

module.exports = { runForwarder };
