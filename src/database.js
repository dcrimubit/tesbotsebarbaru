const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

const dbPath = path.join(__dirname, '..', 'database.json');
let db = {};

// Struktur database default jika file tidak ditemukan
const defaultDb = {
    groups: {}, // Menggunakan objek untuk pencarian lebih cepat berdasarkan ID
    settings: {
        forward_delay: '5000',
        forward_status: 'paused',
        source_message_link: 'BELUM_DIATUR',
        last_run_timestamp: 'Belum pernah berjalan'
    }
};

/**
 * Menyimpan database yang ada di memori ke dalam file database.json.
 */
function saveDb() {
    try {
        // Menggunakan null, 2 untuk pretty-print JSON agar mudah dibaca manusia
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    } catch (error) {
        log(`FATAL: Gagal menyimpan database: ${error.message}`);
    }
}

/**
 * Memuat database dari file JSON, atau membuatnya jika tidak ada.
 */
function initDb() {
    try {
        if (fs.existsSync(dbPath)) {
            const fileContent = fs.readFileSync(dbPath, 'utf-8');
            db = JSON.parse(fileContent);
            // Memastikan semua kunci pengaturan default ada
            db.settings = { ...defaultDb.settings, ...db.settings };
            db.groups = db.groups || {};
        } else {
            db = defaultDb;
            saveDb();
        }
        log("Database JSON berhasil dimuat.");
    } catch (error) {
        log(`FATAL: Gagal memuat database JSON: ${error.message}. Menggunakan database default.`);
        db = defaultDb;
    }
}

// === Fungsi untuk Grup ===
// Dibuat `async` agar tanda tangan fungsi tetap sama dengan versi SQLite,
// sehingga tidak perlu mengubah kode di file lain.
const addOrUpdateGroup = async (groupId, groupName) => {
    db.groups[groupId] = {
        ...(db.groups[groupId] || { is_whitelisted: false }), // Pertahankan status whitelist jika grup sudah ada
        group_id: groupId,
        group_name: groupName,
    };
    saveDb();
};

const removeGroup = async (groupId) => {
    delete db.groups[groupId];
    saveDb();
};

const setWhitelistStatus = async (groupId, status) => {
    if (db.groups[groupId]) {
        db.groups[groupId].is_whitelisted = status;
        saveDb();
    }
};

const getWhitelistedGroups = async () => {
    return Object.values(db.groups).filter(g => g.is_whitelisted);
};

const getAllGroups = async () => {
    return Object.values(db.groups);
};

const getGroupById = async (groupId) => {
    return db.groups[groupId];
};

// === Fungsi untuk Pengaturan ===
const getSetting = async (key) => {
    return db.settings[key];
};

const updateSetting = async (key, value) => {
    db.settings[key] = value;
    saveDb();
};

module.exports = {
    initDb,
    addOrUpdateGroup,
    removeGroup,
    setWhitelistStatus,
    getWhitelistedGroups,
    getAllGroups,
    getGroupById,
    getSetting,
    updateSetting
};